// tests del layout - flatten convierte el arbol en lineas medidas, con borde y sin desbordes

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten, diffLines, frameOutput } from '../backend/terminal/view.mjs';
import { boxSize } from '../backend/terminal/layout.mjs';
import { box, rows, text, gap, split, table, grid } from '../backend/terminal/widgets.mjs';
import { textWidth, escape, sanitize, toAnsi } from '../backend/terminal/ansi.mjs';

test('box con borde redondo ocupa el ancho pedido', () => {
  const lineas = flatten(box(rows([text('hola')]), { border: 'round', pad: [0, 1] }), 20);
  assert.equal(lineas.length, 3);
  assert.equal(lineas[0].content, '╭' + '─'.repeat(18) + '╮');
  assert.equal(lineas[1].content, '│ hola' + ' '.repeat(13) + '│');
  assert.equal(lineas[2].content, '╰' + '─'.repeat(18) + '╯');
  for (const line of lineas) assert.equal(line.width, 20);
});

test('boxSize descuenta borde y padding', () => {
  const medidas = boxSize({ border: 'round', pad: [0, 1], height: 10 }, 20);
  assert.equal(medidas.outerW, 20);
  assert.equal(medidas.innerW, 16);
  assert.equal(medidas.innerH, 8);
  assert.equal(medidas.frame, 2);
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

test('table mide todas las columnas y llena el ancho', () => {
  const lineas = flatten(table({
    headers: ['a', 'bb'],
    rows: [['x', 'y'], ['z', 'w']],
    fill: true,
    align: 'center',
  }), 20);
  assert.equal(lineas.length, 3);
  for (const line of lineas) assert.equal(textWidth(line.content), 20);
  assert.match(lineas[0].content, /a/);
  assert.match(lineas[0].content, /bb/);
  assert.match(lineas[1].content, /x/);
  assert.match(lineas[1].content, /y/);
});

test('table no pierde columnas de filas mas largas', () => {
  const lineas = flatten(table({ rows: [['x'], ['y', 'z']] }), 20);
  assert.deepEqual(lineas.map(l => l.content.trim()), ['x', 'y z']);
  assert.ok(lineas.every(l => l.width <= 20));
});

test('table acepta celdas con estilo propio', () => {
  const lineas = flatten(table({
    headers: ['valor'],
    rows: [[{ text: '+1.00%', style: { fg: 'success' } }]],
  }), 20);
  assert.equal(sanitize(lineas[1].content).trim(), '+1.00%');
  assert.ok(lineas[1].content.includes(toAnsi({ fg: 'success' })));
});

test('grid pinta celdas con roles y respeta ancho y alto', () => {
  const node = grid({
    width: 4,
    height: 2,
    cells: [
      [{ ch: 'a', style: { fg: 'success' } }, { ch: 'b' }, null, { ch: 'c', style: { fg: 'danger' } }],
      [],
    ],
  });
  const lineas = flatten(node, 10);
  assert.equal(lineas.length, 2);
  assert.equal(lineas[0].width, 4);
  assert.equal(sanitize(lineas[0].content), 'ab c');
  assert.equal(sanitize(lineas[1].content), '    ');
  assert.ok(lineas[0].content.includes(escape.reset));
  assert.equal(node._xlabels, undefined);
});

test('grid rellena filas y columnas faltantes', () => {
  const lineas = flatten(grid({ width: 3, height: 2, cells: [[{ ch: 'x' }]] }), 10);
  assert.deepEqual(lineas.map(l => sanitize(l.content)), ['x  ', '   ']);
});
