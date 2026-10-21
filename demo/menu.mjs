// menu de pruebas - elige un demo, lo ejecuta y cuando sale vuelve a preguntar cual iniciar

import { spawn } from 'node:child_process';
import { escape, toAnsi, textWidth, truncateTo, setPalette } from '../backend/terminal/ansi.mjs';
import { Dispatcher, editText } from '../backend/terminal/input.mjs';
import { flatten } from '../backend/terminal/view.mjs';
import { box, rows, text, gap } from '../backend/terminal/widgets.mjs';
import { PALETA } from '../frontend/paleta.mjs';

setPalette(PALETA);

const OPCION  = toAnsi({ fg: 'sec' });
const DETALLE = toAnsi({ fg: 'muted' });
const PROMPT  = `${OPCION}elegi uno:${escape.reset} `;

const DEMOS = [ // demos del substrato (demo/)
  ['view',    'widgets, layout e input de una linea'],
  ['runtime', 'reloj, cola de eventos, resize y errores'],
  ['input',   'ansi y teclado crudo, sin usar el runtime'],
  ['market',  'velas de Binance en vivo sobre el substrato'],
];

let ancho = 80, alto = 24; // tamaño de la ventana actualizado cada render
let aviso = null;          // error de la ultima eleccion
let valor = '';            // valor en vivo del prompt
let corriendo = null;      // el demo en ejecucion, null sin eleccion

// linea del prompt, mismo pintado de boxLine
function lineaPrompt() {
  const inner = Math.max(1, ancho - 4);            // ancho menos los dos bordes y el pad de cada lado
  const corto = truncateTo(PROMPT + valor, inner);
  const relleno = ' '.repeat(Math.max(0, inner - textWidth(corto)));
  return { linea: `│ ${corto}${relleno} │`, col: 3 + textWidth(corto), fila: Math.max(2, alto - 1) };
}

// pinta pantalla entera de una sola escritura - fila por fila y sin salto final
function pintar() {
  ancho = process.stdout.columns || 80;
  alto  = process.stdout.rows || 24;

  const arbol = box(rows([
    gap(1),
    text('demos del sustrato de la terminal', { fg: 'accent', bold: true }),
    gap(),
    ...DEMOS.flatMap(([nombre, que], i) => [
      text(`${OPCION}${i + 1})${escape.reset} ${nombre.padEnd(9)} ${DETALLE}${que}${escape.reset}`),
    ]),
    gap(),
    text('0) salir', { fg: 'muted' }),
    ...(aviso ? [text(aviso, { fg: 'danger' })] : []),
  ]), { border: 'round', pad: [0, 1], height: alto });

  let out = escape.clearScreen + escape.goto(1, 1);
  for (const [i, line] of flatten(arbol, ancho).entries()) out += escape.goto(i + 1, 1) + line.content;

  const p = lineaPrompt();
  out += escape.goto(p.fila, 1) + p.linea + escape.goto(p.fila, p.col);
  process.stdout.write(out + escape.show);
}

// repinta solo la fila del prompt, que es lo unico que cambia mientras se tipea
function repintarPrompt() {
  const p = lineaPrompt();
  process.stdout.write(escape.goto(p.fila, 1) + p.linea + escape.goto(p.fila, p.col));
}

// repsonde a teclas - devuelve true si hay que cerrar el menu
function atender(evt) {
  if (evt.type !== 'key') return false;
  if (evt.key === 'Ctrl+c' || evt.key === 'Ctrl+d') return true;

  if (evt.key === 'Enter') {
    const elegido = Number(valor.trim());
    valor = '';
    if (elegido === 0) return true; // enter tambien cierra
    if (DEMOS[elegido - 1]) { aviso = null; lanzar(DEMOS[elegido - 1][0]); }
    else { aviso = 'Ese no existe.'; pintar(); }
    return false;
  }

  const edit = editText(valor, evt.key);
  if (edit.handled) {
    const tope = Math.max(1, ancho - 4 - textWidth(PROMPT) - 1);
    if ([...edit.value].length <= tope) { valor = edit.value; repintarPrompt(); }
  }
  return false;
}

// ejecuta el demo en otro proceso y vuelve a la pantalla del menu cuando termina
function lanzar(nombre) {
  corriendo = nombre;
  process.stdin.pause(); // demo en stdin mientras se ejecuta
  const hijo = spawn(process.execPath, [`./demo/${nombre}-demo.mjs`], { stdio: 'inherit' });
  let fin = false;
  const volver = () => {
    if (fin) return;
    fin = true;
    corriendo = null;
    try { process.stdin.setRawMode(true); } catch {} // por si demo saco raw mode
    process.stdin.resume();
    pintar();
  };
  hijo.on('error', volver);
  hijo.on('exit', volver);
}

// exit 0 y terminal en raw mode false para evitar error 130
function terminar() {
  try { process.stdin.setRawMode(false); } catch {}
  process.stdin.pause();
  process.stdout.write(escape.show);
  process.exit(0);
}

const dispatcher = new Dispatcher();

// ctrl + c manejado por demo mientras corre
process.on('SIGINT', () => { if (!corriendo) terminar(); });

try { process.stdin.setRawMode(true); } catch {} // raw: cerrar no genera señal
process.stdin.resume();
process.stdin.on('data', chunk => {
  if (corriendo) return;
  dispatcher.onData(chunk, evt => { if (atender(evt)) terminar(); });
});

pintar();