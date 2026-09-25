// demo del sustrato, pinta un panel con marco usando ansi y muestra los eventos que decodifica input
// el footer prueba el helper editText - q o Ctrl+c cierran el demo y vuelven a la terminal

import { escape, palette, textWidth, truncateTo, sanitize } from '../src/ansi.mjs';
import { Dispatcher, editText } from '../src/input.mjs';

// PANTALLA ========================================================================================

const state = { log: [], input: { value: '' }, mouse: null };
const cols = () => process.stdout.columns || 80;
const rows = () => process.stdout.rows || 24;

// agrega el evento al log y lo limita a lo que entra en la pantalla
function push(event) {
  state.log.push(event);
  const room = Math.max(0, rows() - 6);
  if (state.log.length > room) state.log.shift();
}

// pinta el marco completo y redibuja fila por fila para sobreescribir lo previo
function paint() {
  const w = cols(), h = rows();
  const inner = Math.max(0, w - 4);
  let out = escape.hide + escape.goto(1, 1) + escape.clearScreen;
  out += escape.goto(1, 1) + palette.muted + '╭' + '─'.repeat(Math.max(0, w - 2)) + '╮' + escape.reset;
  out += escape.goto(h, 1) + palette.muted + '╰' + '─'.repeat(Math.max(0, w - 2)) + '╯' + escape.reset;
  for (let rowNum = 2; rowNum < h; rowNum++) {
    let content = '';
    if (rowNum === 2) content = palette.accent + 'demo - input + ansi || q para salir' + escape.reset;
    if (rowNum >= 4 && rowNum <= h - 3 && state.log[rowNum - 4]) content = sanitize(JSON.stringify(state.log[rowNum - 4]));
    if (rowNum === h - 1) content = escape.reset + palette.accent + 'input: ' + escape.reset + truncateTo(state.input.value || 'usa el teclado', Math.max(4, w - 12)) + palette.reader + '█' + escape.reset;
    const safe = truncateTo(content, inner);
    const pad = Math.max(0, inner - textWidth(safe));
    out += escape.goto(rowNum, 1) + palette.muted + '│' + escape.reset + ' ' + safe + ' '.repeat(pad) + escape.reset + ' ' + palette.muted + '│' + escape.reset;
  }
  process.stdout.write(out);
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