// tests del layout - flatten convierte el arbol en lineas medidas, con borde y sin desbordes

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten, diffLines, frameOutput } from '../backend/terminal/view.mjs';
import { box, rows, text, gap, split } from '../backend/terminal/widgets.mjs';
import { textWidth, escape } from '../backend/terminal/ansi.mjs';

test('box con borde redondo ocupa el ancho pedido', () => {
  const lineas = flatten(box(rows([text('hola')]), { border: 'round', pad: [0, 1] }), 20);
  assert.equal(lineas.length, 3);
  assert.equal(lineas[0].content, '╭' + '─'.repeat(18) + '╮');
  assert.equal(lineas[1].content, '│ hola' + ' '.repeat(13) + '│');
  assert.equal(lineas[2].content, '╰' + '─'.repeat(18) + '╯');
  for (const line of lineas) assert.equal(line.width, 20);
});

test('alto limita lineas que salen', () => {
  const lineas = flatten(rows([text('a'), text('b'), text('c'), text('d')]), 10, 2);
  assert.deepEqual(lineas.map(l => l.content), ['a', 'b']);
});

test('escapes de estilo son ancho cero', () => {
  const lineas = flatten(box(rows([text('hola', { fg: 'accent', bold: true })]), { border: 'round', pad: [0, 1] }), 20);
  assert.match(lineas[1].content, /\x1b\[/);      // estilo pintado
  assert.equal(textWidth(lineas[1].content), 20); // linea sin ensanchar
});

test('texto con salto de linea ocupa dos filas', () => {
  assert.deepEqual(flatten(text('uno\ndos'), 10).map(l => l.content), ['uno', 'dos']);
});

test('gap deja lineas vacias en el medio', () => {
  const lineas = flatten(rows([text('a'), gap(3), text('b')]), 10);
  assert.deepEqual(lineas.map(l => l.content), ['a', '', '', '', 'b']);
});

test('contenido largo se trunca contra el borde', () => {
  const lineas = flatten(box(rows([text('0123456789ABCDEF')]), { border: 'round', pad: [0, 1] }), 10);
  assert.equal(lineas[1].content, '│ 012345 │');
  assert.equal(textWidth(lineas[1].content), 10);
});

test('split horizontal reparte ancho en dos paneles', () => {
  const panel = letra => box(rows([text(letra)]), { border: 'round', pad: [0, 1] });
  const lineas = flatten(split({ dir: 'h', gap: 1, children: [panel('L'), panel('R')] }), 41);
  assert.equal(lineas.length, 3);
  assert.equal(lineas[1].width, 41);
  assert.equal((lineas[0].content.match(/╭/g) || []).length, 2); // dos marcos
  assert.match(lineas[1].content, /L/);
  assert.match(lineas[1].content, /R/);
});

test('nodo desconocido o sin ancho tira', () => {
  assert.throws(() => flatten({ type: 'fantasma' }, 10), /tipo de nodo desconocido/);
  assert.throws(() => flatten(text('x'), null), /falta el width/);
});

test('diffLines marca solo las lineas que cambiaron', () => {
  const prev = [{ content: 'a' }, { content: 'b' }];
  const next = [{ content: 'a' }, { content: 'B' }, { content: 'c' }];
  assert.deepEqual(diffLines(prev, next), [1, 2]);
  assert.deepEqual(diffLines(next, next), []);
});

test('frameOutput vuelve a pintar con goto y borra hasta fin de linea', () => {
  const out = frameOutput([1], [{ content: 'x' }, { content: 'y' }]);
  assert.equal(out, escape.goto(2, 1) + escape.eraseRight + 'y' + escape.reset);
});