// tests de inputs - bytes raw del stdin a eventos normalizados de teclado y mouse

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dispatcher, editText, utf8Pending } from '../backend/terminal/input.mjs';

// manda un chunk al dispatcher y devuelve lo que emitio
function chunk(d, data) {
  const eventos = [];
  d.onData(Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), e => eventos.push(e));
  return eventos;
}

test('texto plano a teclas', () => {
  const d = new Dispatcher();
  const eventos = chunk(d, 'ab');
  assert.equal(eventos.length, 2);
  assert.deepEqual(eventos[0], { type: 'key', key: 'a', shift: false, alt: false, ctrl: false });
  assert.equal(eventos[1].key, 'b');
});

test('secuencias de escape y teclas de control decodificadas', () => {
  const d = new Dispatcher();
  assert.equal(chunk(d, '\x1b[A')[0].key, 'ArrowUp');
  assert.equal(chunk(d, '\x1b[3~')[0].key, 'Delete');
  assert.equal(chunk(d, '\r')[0].key, 'Enter');
  assert.equal(chunk(d, '\x7f')[0].key, 'Backspace');
  const ctrl = chunk(d, '\x03')[0];
  assert.equal(ctrl.key, 'Ctrl+c');
  assert.equal(ctrl.ctrl, true);
});

test('un caracter UTF-8 de dos chunks se junta', () => {
  const d = new Dispatcher();
  assert.deepEqual(chunk(d, Buffer.from([0xc3])), []);                          // falta la continuacion
  const eventos = chunk(d, Buffer.from([0xb1]));                                // llega la segunda mitad: ñ
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].key, 'ñ');
});

test('utf8Pending cuenta bytes que faltan para el char', () => {
  assert.equal(utf8Pending(Buffer.from([0xc3])), 1);                            // falta la continuacion
  assert.equal(utf8Pending(Buffer.from([0xe2, 0x94])), 2);                      // lead de 3 y llego uno solo
  assert.equal(utf8Pending(Buffer.from('a')), 0);                               // ascii completo
  assert.equal(utf8Pending(Buffer.from('ñ')), 0);                               // caracter completo
});

test('timer de 30ms en Esc suelto', async () => {
  const d = new Dispatcher();
  const eventos = [];
  d.onData(Buffer.from([0x1b]), e => eventos.push(e));
  assert.equal(eventos.length, 0, 'esperando otra tecla');
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].key, 'Esc');
  d.destroy();
});

test('Esc + resto de la secuencia cancela el timer', async () => {
  const d = new Dispatcher();
  const eventos = [];
  d.onData(Buffer.from([0x1b]), e => eventos.push(e));
  d.onData(Buffer.from('[A'), e => eventos.push(e));      // completo: \x1b[A = ArrowUp
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(eventos.map(e => e.key), ['ArrowUp']); // no envio Esc suelto
  d.destroy();
});

test('SGR mouse reporta posicion y fase', () => {
  const d = new Dispatcher();
  assert.deepEqual(chunk(d, '\x1b[<0;10;5M')[0],
    { type: 'mouse', btn: 0, col: 10, row: 5, down: true, phase: 'down', dx: 0, dy: 0 });
  assert.equal(chunk(d, '\x1b[<0;10;5m')[0].phase, 'up');
});

test('editText agrega, borra y deja pasar lo que no edita', () => {
  assert.deepEqual(editText('abc', 'd'), { value: 'abcd', handled: true });
  assert.deepEqual(editText('abc', ' '), { value: 'abc ', handled: true });
  assert.deepEqual(editText('abc', 'Backspace'), { value: 'ab', handled: true });
  assert.deepEqual(editText('añ', 'Backspace'), { value: 'a', handled: true });   // borra por code point
  assert.deepEqual(editText('abc', 'ArrowUp'), { value: 'abc', handled: false });
  assert.deepEqual(editText('abc', 'Enter'), { value: 'abc', handled: false });
});