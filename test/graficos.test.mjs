// tests del grafico de velas - produce un grid exacto y sin ANSI

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten } from '../backend/terminal/view.mjs';
import { sanitize } from '../backend/terminal/ansi.mjs';
import { graficoVelas } from '../frontend/graficos/velas.mjs';
import { vistaMercado } from '../frontend/vistas/mercado.mjs';

function velas(cantidad, base = 100) {
  return Array.from({ length: cantidad }, (_, i) => ({
    open_time: i * 60000,
    open: String(base + i),
    high: String(base + i + 2),
    low: String(base + i - 2),
    close: String(base + i + (i % 2 ? -1 : 1)),
    volume: '1',
  }));
}

test('graficoVelas devuelve un grid con el tamaño pedido', () => {
  const node = graficoVelas({
    velas: velas(12),
    width: 40,
    height: 11,
    interval: '1m',
    showAxis: true,
  });

  assert.equal(node.type, 'grid');
  assert.equal(node.width, 40);
  assert.equal(node.height, 11);
  assert.equal(node.cells.length, 11);
  assert.ok(node.cells.every(fila => fila.length === 40));

  const lineas = flatten(node, 40);
  assert.equal(lineas.length, 11);
  assert.ok(lineas.every(linea => linea.width <= 40));

  const celdas = node.cells.flat().filter(Boolean);
  assert.ok(celdas.every(celda => !celda.ch.includes('\x1b')));
  assert.ok(celdas.some(celda => celda.style?.fg === 'success' || celda.style?.fg === 'danger'));
  assert.equal(node._xlabels, undefined);
});

test('graficoVelas con rango plano no rompe', () => {
  const planas = velas(8).map(v => ({
    ...v,
    open: '100',
    high: '100',
    low: '100',
    close: '100',
  }));
  assert.doesNotThrow(() => flatten(graficoVelas({
    velas: planas,
    width: 30,
    height: 8,
  }), 30));
});

test('graficoVelas sin velas ocupa el grid y avisa', () => {
  const node = graficoVelas({ velas: [], width: 30, height: 8 });
  const lineas = flatten(node, 30);
  assert.equal(lineas.length, 8);
  assert.match(sanitize(lineas[0].content), /^sin velas/);
});

test('graficoVelas exige width y height', () => {
  assert.throws(() => graficoVelas({ velas: velas(2) }), /faltan width y height/);
});

test('vistaMercado compone el grafico sin romper', () => {
  const estado = {
    symbol: 'BTCUSDT',
    interval: '1m',
    velas: velas(12),
    error: null,
    ultimo: '111',
    actualizado_en: Date.now(),
    zoomX: 12,
    offset: 0,
    zoomY: 1,
    offsetY: 0,
    precision: false,
  };
  assert.doesNotThrow(() => flatten(vistaMercado(estado), 80, 24));
});
