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

function mercadoApp() {
  const { estado, cargar } = crearEstado({ symbol: 'BTCUSDT', interval: '1m', limite: 100 });
  return {
    init: async () => {
      await cargar();
      return estado;
    },
    subscriptions: [Sub.interval(5000, 'poll')],
    update: async (model, event) => {
      if (event.type === 'key' && (event.key === 'q' || event.key === 'h')) {
        stop();
        run(home);
        return model;
      }
      if (event.type === 'sub:tick' && event.tag === 'poll') {
        await cargar();
        return estado;
      }
      return model;
    },
    view: () => vistaMercado(estado)
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