// demo de las vistas, arma un panel de operacion usando widgets y lo corre sobre el runtime
// q o Ctrl+c cierran el demo y vuelven a la terminal

import { sanitize } from '../src/ansi.mjs';
import { editText } from '../src/input.mjs';
import { run, quit, size } from '../src/runtime.mjs';
import { split, box, rows, text, gap, table, bar, input } from '../src/widgets.mjs';

// PANTALLA ========================================================================================

// arma el arbol con dos paneles, tablas y barras a la izquierda y eventos + input a la derecha
function build(state) {
  const h = size().rows; // el runtime sabe cuanto mide la terminal - la app no lo pregunta al global
  const left = box(rows([
    gap(1),
    text('crypto', { fg: 'accent', bold: true }),
    table({ headers: ['símbolo', 'precio', 'cambio'], rows: state.symbols, cursor: state.cursor }),
    gap(1),
    bar({ label: 'BTC', value: '62%', percent: 0.62 }),
    bar({ label: 'ETH', value: '38%', percent: 0.38 }),
    bar({ label: 'SOL', value: '12%', percent: 0.12 }),
  ]), { border: 'round', height: h, pad: [0, 1] });

  const room = Math.max(0, h - 8);
  const events = state.log.slice(-room).map(ev => text(sanitize(JSON.stringify(ev)), { fg: 'muted' }));
  const right = box(rows([
    gap(1),
    text('eventos', { fg: 'accent', bold: true }),
    text('mouse: ' + (state.mouse ? state.mouse.col + ',' + state.mouse.row : 'off'), { fg: 'sec' }),
    ...events,
    gap(1),
    input({ label: 'input', value: state.input.value, placeholder: '- usa el teclado', focused: true }),
  ]), { border: 'round', height: h, pad: [0, 1], valign: 'bottom' });

  return split({ dir: 'h', gap: 1, children: [left, right] });
}

// APP =============================================================================================

run({ // runtime maneja la app como objeto - init lo arma, update lo cambia y view lo dibuja
  init: () => ({
    log: [{ type: 'key', key: 'ready' }],
    input: { value: '' },
    cursor: 0,
    mouse: null,
    symbols: [
      ['BTC', '102.4k', '+2.1%'],
      ['ETH', '3.9k', '+0.4%'],
      ['SOL', '172', '-1.2%'],
      ['ADA', '0.44', '+0.8%'],
    ],
  }),

  // cada evento es una linea en el log - las teclas escriben en el input - q/ctrl+c sale
  update: (state, event) => {
    if (event.type === 'key' && (event.key === 'q' || event.key === 'Ctrl+c')) {
      quit();
      return state;
    }
    const next = { ...state, log: [...state.log, event] };
    if (event.type === 'key') {
      const res = editText(next.input.value, event.key);
      if (res.handled) next.input = { ...next.input, value: res.value };
    }
    if (event.type === 'mouse') next.mouse = event;
    return next;
  },

  view: build,
});