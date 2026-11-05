// entry point de la app - aplica la paleta y alterna entre el inicio, el monitor y los demos

import { spawn } from 'node:child_process';
import { run, stop, size, quit } from './backend/terminal/runtime.mjs';
import { setPalette } from './backend/terminal/ansi.mjs';
import { PALETA } from './frontend/paleta.mjs';
import { box, rows, text, gap } from './backend/terminal/widgets.mjs';
import { crearMonitor } from './frontend/vistas/monitor.mjs';

setPalette(PALETA);

// el aviso experimental de node:sqlite ensucia la pantalla - los demas avisos se muestran igual
process.removeAllListeners('warning');
process.on('warning', aviso => {
  if (aviso.name !== 'ExperimentalWarning' || !aviso.message.includes('SQLite')) console.warn(`${aviso.name}: ${aviso.message}`);
});

// en la web, b le pide a la pagina bajar la base de la sesion por OSC
const EN_WEB = Boolean(process.env.TERMINAL_WEB);
const PEDIR_BASE = '\x1b]7701;descargar-base\x07';

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
      text(`terminal ${cols}x${filas}`, { fg: 'sec' }),
      text(`iniciado ${model.inicio.toLocaleTimeString('es-AR')}`, { fg: 'sec' }),
      gap(),
      text('m monitor', { fg: 'sec' }),
      text('d demos', { fg: 'sec' }),
      ...(EN_WEB ? [text('b descargar base', { fg: 'sec' })] : []),
      text('q salir', { fg: 'sec' }),
    ]), { border: 'round', height: filas, pad: [0, 1] });
  },

  update: async (model, event) => {
    if (event.type !== 'key') return model;
    if (event.key === 'q') quit();
    if (event.key === 'b' && EN_WEB) process.stdout.write(PEDIR_BASE);
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
      run(monitor);
      return;
    }
    return model;
  },
};

// el monitor se crea una vez - conserva simbolo, zoom e indicadores entre visitas
const monitor = crearMonitor({
  symbol: 'BTCUSDT',
  simbolos: ['BTCUSDT', 'ETHUSDT'],
  interval: '1m',
  limite: 200,
  salir: volverAlInicio,
});

function volverAlInicio() {
  stop();
  run(home);
}

function correrMenu() {
  return new Promise(resolve => {
    const hijo = spawn(process.execPath, ['./demo/menu.mjs'], { stdio: 'inherit' });
    hijo.on('error', resolve);
    hijo.on('exit', resolve);
  });
}

run(home);
