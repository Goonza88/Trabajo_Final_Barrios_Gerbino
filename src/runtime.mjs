// el loop de la app - maneja ciclos de vida, escucha eventos y pinta
// la app se declara con un objeto { init, update, view, subscriptions }

import { escape } from './ansi.mjs';
import { Dispatcher } from './input.mjs';
import { flatten, diffLines, frameOutput } from './view.mjs';

// ESTADO ==========================================================================================

let app          = null;                  // descriptor de la app que esta corriendo
let model        = null;                  // estado que se pasa de update a view
let running      = false;                 // mientras sea true el loop sigue
let dispatcher   = null;                  // convierte bytes del teclado en eventos
let lastLines    = [];                    // lineas del frame anterior, para comparar
let firstFrame   = true;                  // el primer frame limpia la pantalla
let resizeDirty  = false;                 // al redimensionar hay que repintar todo
let frameQueued  = false;                 // ya hay un repintado agendado
let chain        = Promise.resolve();     // los updates se ejecutan de a uno, en orden
let timers       = [];                    // ids de los intervalos que hay que limpiar al cerrar
let detach       = null;                  // saca los listeners cuando la app cierra
let lastCtrlC    = 0;                     // cuando llego el Ctrl+C anterior, por si hay que insistir

// API =============================================================================================

export const Sub = { // fuentes de eventos de la app - por ahora solo el reloj
  interval(ms, tag = null) { return { type: 'interval', ms, tag }; },
};

export function size() { // tamaño de la terminal para que las apps no usen el global
  return { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 };
}

// ejecuta la app - prende subscriptions, toma terminal y pide el primer frame
// init devuelve el modelo inicial - update(model, event) el nuevo - view(model) el arbol
export function run(desc) {
  if (running) throw new Error('runtime.run: ya hay una app corriendo');
  app = desc;
  running = true;
  dispatcher = new Dispatcher();
  lastLines = [];
  firstFrame = true;
  resizeDirty = false;
  frameQueued = false;
  chain = Promise.resolve();

  startSubs();
  enter();
  process.stdout.on('resize', onResize);
  process.stdin.on('data', onStdin);
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  process.on('uncaughtException', onCrash);
  process.on('unhandledRejection', onCrash);
  detach = () => {
    process.stdout.off('resize', onResize);
    process.stdin.off('data', onStdin);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    process.off('uncaughtException', onCrash);
    process.off('unhandledRejection', onCrash);
  };

  // modelo inicial entra por la misma queue - ningun update lo ve a la mitad
  chain = chain.then(async () => {
    try {
      model = (app.init ? await app.init() : null) ?? {};
    } catch (error) {
      return crash('init', error);
    }
    requestFrame();
  });
}

// cierra la app - restaura terminal y sale con el codigo recibido
export function quit(code = 0) {
  stop();
  process.exit(code);
}

// LOOP ============================================================================================

// mete en queue un evento - los updates se ejecutan de a uno y en orden
function dispatch(event) {
  if (!running) return;
  chain = chain.then(() => apply(event));
}

// aplica un evento al modelo y pide repintar - update puede ser async y la queue espera
async function apply(event) {
  if (!running) return;
  if (event.type === 'key' && event.key === 'Ctrl+c') { // dos Ctrl+c seguidos cierran
    const now = Date.now();
    if (now - lastCtrlC < 600) { quit(0); return; }
    lastCtrlC = now;
  }
  if (app.update) {
    try {
      const res = await app.update(model, event);
      model = res ?? model; // si no devuelve, se asume que toco el modelo
    } catch (error) {
      return crash('update', error);
    }
  }
  requestFrame();
}

// pide repintar - si ya hay una request no hace nada (evita pintar mas de una vez)
function requestFrame() {
  if (frameQueued || !running) return;
  frameQueued = true;
  setTimeout(() => { frameQueued = false; paint(); }, 16);
}

// arma el arbol - lo aplana al tamaño de la terminal y escribe las lineas que cambiaron
function paint() {
  if (!running || !app.view) return;
  const { cols: width, rows: height } = size();
  let lines;
  try {
    lines = flatten(app.view(model), width, height);
  } catch (error) {
    return crash('view', error);
  }
  const full = firstFrame || resizeDirty; // arrancar y redimensionar repintan todo
  if (full) { firstFrame = false; resizeDirty = false; }
  const changes = full ? lines.map((_, i) => i) : diffLines(lastLines, lines);
  if (!changes.length) return;
  process.stdout.write((full ? escape.clearScreen + escape.home : '') + frameOutput(changes, lines));
  lastLines = lines;
}

// TERMINAL ========================================================================================

// pasa a modo alternativo con mouse y cursor ocultos - teclado en modo raw
function enter() {
  try { process.stdin.setRawMode(true); } catch {}
  process.stdin.resume();
  process.stdout.write(escape.enter + escape.hide);
}

// vuelve la terminal a su estado normal - suelta timers y listeners
function stop() {
  if (!running) return;
  running = false;
  for (const id of timers) clearInterval(id);
  timers = [];
  dispatcher.destroy();
  if (detach) { detach(); detach = null; }
  try { process.stdin.setRawMode(false); } catch {}
  process.stdin.pause();
  process.stdout.write(escape.leave + escape.show);
}

// el cambio de tamaño repinta todo y la app recibe evento
function onResize() {
  resizeDirty = true;
  requestFrame();
  dispatch({ type: 'resize', cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 });
}

// bytes del teclado a evento normalizado
function onStdin(chunk) {
  dispatcher.onData(chunk, dispatch);
}

// ctrl+c - salida limpia
function onSignal() {
  quit(0);
}

// error no controlado - cierra
function onCrash(error) {
  crash('inesperado', error);
}

// error sin manejar - restaura, avisa por stderr y sale con codigo 1
function crash(where, error) {
  stop();
  console.error('runtime: fallo en ' + where + ': ' + (error?.message ?? error));
  process.exit(1);
}

// SUSCRIPCIONES ===================================================================================

// inicia las subs del descriptor - cada tick entra a la queue como un evento mas
function startSubs() {
  for (const sub of app.subscriptions || []) {
    if (sub?.type !== 'interval') throw new TypeError('runtime.run: subscription desconocida: ' + sub?.type);
    timers.push(setInterval(() => dispatch({ type: 'sub:tick', tag: sub.tag }), sub.ms));
  }
}