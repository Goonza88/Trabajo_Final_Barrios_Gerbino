// demo de las vistas, arma un panel de operacion usando widgets y usa flatten + diff para repintar

import { escape, palette, sanitize } from '../src/ansi.mjs';
import { Dispatcher, editText } from '../src/input.mjs';
import { split, box, rows, text, gap, table, bar } from '../src/widgets.mjs';
import { flatten, diffLines, frameOutput } from '../src/view.mjs';

// PANTALLA ========================================================================================

const state = { log: [], input: { value: '' }, cursor: 0, symbols: [
  ['BTC', '102.4k', '+2.1%'],
  ['ETH', '3.9k', '+0.4%'],
  ['SOL', '172', '-1.2%'],
  ['ADA', '0.44', '+0.8%'],
] };

const cols = () => process.stdout.columns || 80;
const height = () => process.stdout.rows || 24;
let prev = [];
let first = true;

// arma el arbol con dos paneles, tablas y barras a la izquierda y eventos + input a la derecha
function build() {
  const h = height();
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
    text(escape.reset + palette.accent + 'input: ' + escape.reset + (state.input.value || 'usa el teclado') + palette.reader + '█' + escape.reset),
  ]), { border: 'round', height: h, pad: [0, 1], valign: 'bottom' });

  return split({ dir: 'h', gap: 1, children: [left, right] });
}

// aplana el arbol, compara con lo anterior y escribe solo lo que cambio
function paint() {
  const w = cols(), h = height();
  const lines = flatten(build(), w, h);
  const changes = diffLines(prev, lines);
  let out = escape.hide;
  if (first) out += escape.goto(1, 1) + escape.clearScreen;
  out += frameOutput(changes, lines);
  process.stdout.write(out);
  prev = lines;
  first = false;
}

// EVENTOS =========================================================================================

// cierra el proceso y restaura terminal
function shutdown() {
  process.stdout.write(escape.leave + escape.show);
  try { process.stdin.setRawMode(false); } catch {}
  process.stdin.pause();
  dispatcher.destroy();
  process.exit(0);
}

// maneja eventos: salir, editar input o actualizar mouse
function onEvent(event) {
  if (event.type === 'key') {
    if (event.key === 'q' || event.key === 'Ctrl+c') return shutdown();
    const res = editText(state.input.value, event.key);
    if (res.handled) state.input.value = res.value;
  }
  if (event.type === 'mouse') state.mouse = event;
  push(event);
  paint();
}

// agrega el evento al log de eventos
function push(event) {
  state.log.push(event);
}

// ARRANQUE ========================================================================================

const dispatcher = new Dispatcher();
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdout.write(escape.enter);
process.stdout.on('resize', () => paint());
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.stdin.on('data', chunk => dispatcher.onData(chunk, onEvent));
push({ type: 'key', key: 'ready' });
paint();