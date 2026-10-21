// entry point temporal de la app - inicia el substrato de la terminal
// con "d" se ejecuta el menu de demos - la primera vista real la arma frontend/vistas

import { spawn } from 'node:child_process';
import { run, stop, size, quit } from './backend/terminal/runtime.mjs';
import { setPalette } from './backend/terminal/ansi.mjs';
import { PALETA } from './frontend/paleta.mjs';
import { box, rows, text, gap } from './backend/terminal/widgets.mjs';

// la identidad esta en frontend/paleta.mjs - los defaults son neutros
setPalette(PALETA);

const app = {
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
      text('d demos', { fg: 'sec' }),
      text('q salir', { fg: 'sec' }),
    ]), { border: 'round', height: filas, pad: [0, 1] });
  },

  // cada evento pasa por aca en orden - update puede ser async y la queue espera
  update: async (model, event) => {
    if (event.type !== 'key') return model;
    if (event.key === 'q') quit();
    if (event.key === 'd') {
      stop();                          // soltamos la terminal para que el menu la use
      const proteger = () => {};       // mientras corre el menu el Ctrl+C es asunto del menu, no nuestro
      process.on('SIGINT', proteger);
      await correrMenu();
      process.off('SIGINT', proteger);
      run(app);                        // vuelve la pantalla inicial, con modelo nuevo
      return;                          // el update viejo no pisa el modelo que acaba de arrancar
    }
    return model;
  },
};

// corre el menu de demos como un proceso aparte
function correrMenu() {
  return new Promise(resolve => {
    const hijo = spawn(process.execPath, ['./demo/menu.mjs'], { stdio: 'inherit' });
    hijo.on('error', resolve);
    hijo.on('exit', resolve);
  });
}

run(app);