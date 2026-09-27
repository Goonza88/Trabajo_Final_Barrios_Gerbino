// demo del runtime: la app declara init, update, view y un reloj - el runtime se encarga del resto
// q sale - a prende un update lento (se ve la cola de eventos) - e tira a proposito para ver el error
// Ctrl+c sale solo al segundo intento, sin que la app tenga que hacer nada

import { sanitize } from '../src/ansi.mjs';
import { run, quit, size, Sub } from '../src/runtime.mjs';
import { split, box, rows, text, gap, table } from '../src/widgets.mjs';

// PANTALLA ========================================================================================

// arma el arbol con el estado del reloj a la izquierda y los eventos que entran a la derecha
function build(state) {
  const h = size().rows; // el tamaño lo da el runtime - la app no lee process.stdout
  const left = box(rows([
    gap(1),
    text('runtime', { fg: 'accent', bold: true }),
    table({ headers: ['dato', 'valor'], rows: [
      ['terminal', size().cols + 'x' + h],
      ['ticks', String(state.ticks)],
      ['update', state.lento ? 'lento (1.2s)' : 'normal'],
    ] }),
    gap(1),
    text('q salir', { fg: 'sec' }),
    text('a update lento', { fg: 'sec' }),
    text('e error a proposito', { fg: 'sec' }),
    text('Ctrl+c sale al segundo', { fg: 'muted' }),
  ]), { border: 'round', height: h, pad: [0, 1] });

  const room = Math.max(0, h - 4);
  const events = state.log.slice(-room).map(ev => text(sanitize(JSON.stringify(ev)), { fg: 'muted' }));
  const right = box(rows([
    gap(1),
    text('eventos', { fg: 'accent', bold: true }),
    ...events,
  ]), { border: 'round', height: h, pad: [0, 1] });

  return split({ dir: 'h', gap: 1, children: [left, right] });
}

// APP =============================================================================================

run({ // init arma el modelo - subscriptions pide el reloj - update aplica - view dibuja
  init: () => ({ ticks: 0, lento: false, log: [{ type: 'key', key: 'ready' }] }),

  // un intervalo de 1s entra a la cola como un evento mas, igual que una tecla
  subscriptions: [Sub.interval(1000, 'reloj')],

  // cada evento pasa por aca en orden - con 'a' el update tarda y lo que llega se encola detras
  update: async (state, event) => {
    if (event.type === 'key') {
      if (event.key === 'q') { quit(); return state; }
      if (event.key === 'a') return { ...state, lento: !state.lento };
      if (event.key === 'e') throw new Error('error a proposito desde update');
    }
    if (state.lento) await new Promise(r => setTimeout(r, 1200));
    return { ...state, ticks: state.ticks + 1, log: [...state.log, event] };
  },

  view: build,
});