// entry point temporal de la app - inicia el substrato de la terminal
// con "d" se ejecuta el menu de demos - la primera vista real la arma frontend/vistas

import { spawn } from 'node:child_process';
import { run, stop, size, quit, Sub } from './backend/terminal/runtime.mjs';
import { setPalette } from './backend/terminal/ansi.mjs';
import { PALETA } from './frontend/paleta.mjs';
import { box, rows, text, gap } from './backend/terminal/widgets.mjs';
import { crearEstado } from './frontend/estado/mercado.mjs';
import { vistaMercado } from './frontend/vistas/mercado.mjs';

setPalette(PALETA);

const home = {
  init: () => ({ inicio: new Date() }),

  view: (model) => {
    const { cols, rows: filas } = size();
    return box(rows([
      gap(1),
      text('Trabajo Final - Barrios, Gerbino', { fg: 'accent', bold: true }),
      gap(),
      text('monitoreo y analisis de mercados en terminal', { fg: 'sec' }),
      gap(),
      text(`terminal ${cols}x${filas}`, { fg: 'muted' }),
      text(`iniciado ${model.inicio.toLocaleTimeString('es-AR')}`, { fg: 'muted' }),
      gap(),
      text('m mercado', { fg: 'sec' }),
      text('d demos', { fg: 'sec' }),
      text('q salir', { fg: 'sec' }),
    ]), { border: 'round', height: filas, pad: [0, 1] });
  },

  update: async (model, event) => {
    if (event.type !== 'key') return model;
    if (event.key === 'q') quit();
    if (event.key === 'd') {
      stop();
      const proteger = () => {};
      process.on('SIGINT', proteger);
      await correrMenu();
      process.off('SIGINT', proteger);
      run(home);
      return;
    }
    if (event.key === 'm') {
      stop();
      run(mercado);
      return;
    }
    return model;
  },
};

let modoTabla = false;

function mercadoApp() {
  const { estado, cargar, setIntervalo, zoomH, zoomV, mover, cancelar } = crearEstado({ symbol: 'BTCUSDT', interval: '1m', limite: 200 });
  return {
    init: async () => {
      modoTabla = false;
      await cargar();
      return estado;
    },
    subscriptions: [Sub.interval(5000, 'poll')],
    update: async (model, event) => {
      if (event.type === 'key') {
        if (event.key === 'q') {
          cancelar();
          stop();
          run(home);
          return model;
        }
        if (event.key === 't') {
          modoTabla = !modoTabla;
          return estado;
        }
        if (event.key === 'p') {
          if (!estado.precision) {
            estado.zoomYBeforePrecision = estado.zoomY;
            estado.precision = true;
            const list = estado.zoomYSnap;
            let best = 0, bestD = Infinity;
            for (let i = 0; i < list.length; i++) {
              const d = Math.abs(list[i] - estado.zoomY);
              if (d < bestD) { bestD = d; best = i; }
            }
            estado.zoomY = list[best];
          } else {
            if (estado.zoomYBeforePrecision != null) {
              estado.zoomY = estado.zoomYBeforePrecision;
              estado.zoomYBeforePrecision = null;
            }
            estado.precision = false;
          }
          return estado;
        }
        if (event.key === 'a') { await setIntervalo('1m'); return estado; }
        if (event.key === 's') { await setIntervalo('5m'); return estado; }
        if (event.key === 'd') { await setIntervalo('1h'); return estado; }
        if (event.key === 'f') { await setIntervalo('4h'); return estado; }
        if (event.key === 'g') { await setIntervalo('1d'); return estado; }
        if (event.key === 'h') { mover('h'); return estado; }
        if (event.key === 'j') { mover('j'); return estado; }
        if (event.key === 'k') { mover('k'); return estado; }
        if (event.key === 'l') { mover('l'); return estado; }
        if (event.key === 'y') { zoomH('-'); return estado; }
        if (event.key === 'o') { zoomH('+'); return estado; }
        if (event.key === 'u') { zoomV('-'); return estado; }
        if (event.key === 'i') { zoomV('+'); return estado; }
      }
      if (event.type === 'sub:tick' && event.tag === 'poll') {
        await cargar();
        return estado;
      }
      return model;
    },
    view: () => vistaMercado(estado, modoTabla)
  };
}

const mercado = mercadoApp();

function correrMenu() {
  return new Promise(resolve => {
    const hijo = spawn(process.execPath, ['./demo/menu.mjs'], { stdio: 'inherit' });
    hijo.on('error', resolve);
    hijo.on('exit', resolve);
  });
}

run(home);