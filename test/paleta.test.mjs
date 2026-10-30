// tests y mutacion de la paleta global - setPalette valida roles, colores y hace merge parcial

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPalette, palette, toAnsi, escape, sanitize } from '../backend/terminal/ansi.mjs';

test('rol con typo tira error', () => {
  assert.throws(() => setPalette({ acento: '#BCF734' }), /rol desconocido: acento/);
});

test('hex se convierte a truecolor', () => {
  setPalette({ accent: '#BCF734' });
  assert.equal(palette.accent, escape.fg(0xbc, 0xf7, 0x34));
  assert.equal(toAnsi({ fg: 'accent' }), escape.fg(0xbc, 0xf7, 0x34));
});

test('[r,g,b] crudo se acepta', () => {
  setPalette({ muted: [1, 2, 3] });
  assert.equal(palette.muted, escape.fg(1, 2, 3));
});

test('merge parcial: lo que no viene conserva el color', () => {
  const antes = palette.success;
  setPalette({ sec: [9, 9, 9] });
  assert.equal(palette.success, antes);
  assert.equal(palette.sec, escape.fg(9, 9, 9));
});

test('colores invalidos tiran error', () => {
  assert.throws(() => setPalette({ danger: 'rojo' }), /color invalido/);
  assert.throws(() => setPalette({ danger: [1, 2] }), /color invalido/);          // no son 3
  assert.throws(() => setPalette({ danger: [0, 300, 0] }), /color invalido/);     // fuera de rango
  assert.throws(() => setPalette({ danger: '#zzzzzz' }), /color invalido/);       // hex invalido
  assert.throws(() => setPalette({ danger: '#fff' }), /color invalido/);          // hex corto
});

test('toAnsi ignora roles y colores desconocidos sin romper', () => {
  assert.equal(toAnsi({ fg: '#zzzzzz' }), '');
  assert.equal(toAnsi({ fg: 'toString' }), '');
});

test('sanitize limpia controles y escapes externos', () => {
  assert.equal(sanitize('a\r\x1b[31mb\tc'), 'ab  c');
});

test('selected es rol de fondo: existe en setPalette pero no en palette', () => {
  setPalette({ selected: '#000608' });                                          // no tira error, rol valido
  assert.equal(palette.selected, undefined);                                      // no tiene pintado fg
  assert.equal(toAnsi({ bg: 'selected' }), escape.bg(0, 6, 8));
});
