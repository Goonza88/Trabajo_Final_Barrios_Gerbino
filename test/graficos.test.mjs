// tests del grafico de velas - produce un grid exacto y sin ANSI

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten } from '../backend/terminal/view.mjs';
import { sanitize, toAnsi } from '../backend/terminal/ansi.mjs';
import { graficoVelas } from '../frontend/graficos/velas.mjs';
import { vistaMercado } from '../frontend/vistas/mercado.mjs';
import { anchoWatchlist, lineasAyuda, vistaWatchlist } from '../frontend/features/watchlist.mjs';

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

test('vistaMercado compone watchlist y grafico sin romper', () => {
  const estado = {
    symbol: 'BTCUSDT',
    simbolos: ['BTCUSDT', 'ETHUSDT'],
    tickers: {
      BTCUSDT: { symbol: 'BTCUSDT', price: '111', open_24h: '100' },
      ETHUSDT: { symbol: 'ETHUSDT', price: '180', open_24h: '200' }
    },
    tickers_error: null,
    cursor: 0,
    foco: 'watchlist',
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
  const lineas = flatten(vistaMercado(estado), 80, 24);
  const texto = sanitize(lineas.map(linea => linea.content).join('\n'));
  assert.match(texto, /watchlist/);
  assert.match(texto, /BTCUSDT/);
  assert.match(texto, /ETHUSDT/);
  assert.match(texto, /\+11\.00%/);
  assert.match(texto, /-10\.00%/);
  assert.doesNotThrow(() => flatten(vistaMercado({ ...estado, tickers: Object.values(estado.tickers), foco: 'grafico' }, true), 80, 24));
});

test('watchlist arma una ayuda por keybind y calcula el ancho para no cortarlas', () => {
  const ayudas = lineasAyuda(['1m', '5m', '1h', '4h', '1d']);
  assert.deepEqual(ayudas, [
    'Enter - Seleccionar',
    'Tab - Cambiar Foco',
    '',
    'h - Izquierda',
    'j - Abajo',
    'k - Arriba',
    'l - Derecha',
    '',
    'y - Alejar Horizontal',
    'u - Alejar Vertical',
    'i - Acercar Vertical',
    'o - Acercar Horizontal',
    '',
    't - Vista de Tabla',
    'p - Vista de Precision',
    '',
    'a - Intervalo 1m',
    's - Intervalo 5m',
    'd - Intervalo 1h',
    'f - Intervalo 4h',
    'g - Intervalo 1d',
    '',
    'q - Volver'
  ]);
  const ancho = anchoWatchlist({ intervalos: ['1m', '5m', '1h', '4h', '1d'] });
  assert.ok(ancho >= Math.max(...ayudas.map(linea => linea.length)) + 4);
});

test('watchlist pega las ayudas al fondo y colorea la variacion 24h', () => {
  const estado = {
    symbol: 'BTCUSDT',
    simbolos: ['BTCUSDT', 'ETHUSDT'],
    tickers: {
      BTCUSDT: { symbol: 'BTCUSDT', price: '111', open_24h: '100' },
      ETHUSDT: { symbol: 'ETHUSDT', price: '180', open_24h: '200' }
    },
    tickers_error: null,
    cursor: 0,
    foco: 'watchlist',
    intervalos: ['1m', '5m', '1h', '4h', '1d']
  };
  const ancho = anchoWatchlist(estado);
  const lineas = flatten(vistaWatchlist(estado, { width: ancho, height: 24 }), ancho, 24);
  const texto = lineas.map(linea => sanitize(linea.content));

  for (const ayuda of lineasAyuda(estado.intervalos).filter(Boolean)) {
    assert.ok(texto.some(linea => linea.includes(ayuda)), 'falta la ayuda: ' + ayuda);
  }
  assert.match(texto[22], /q - Volver/);
  assert.match(texto[23], /╰/);

  const btc = lineas.find(linea => sanitize(linea.content).includes('BTCUSDT'));
  const eth = lineas.find(linea => sanitize(linea.content).includes('ETHUSDT'));
  assert.ok(btc.content.includes(toAnsi({ fg: 'success' })));
  assert.ok(eth.content.includes(toAnsi({ fg: 'danger' })));
  assert.ok(btc.content.includes(toAnsi({ fg: 'accent' })));
  assert.ok(!btc.content.includes(toAnsi({ bg: 'selected' })));
});

test('watchlist muestra secciones completas cuando la terminal tiene altura', () => {
  const estado = {
    symbol: 'BTCUSDT',
    simbolos: ['BTCUSDT', 'ETHUSDT'],
    tickers: {
      BTCUSDT: { symbol: 'BTCUSDT', price: '111', open_24h: '100' },
      ETHUSDT: { symbol: 'ETHUSDT', price: '180', open_24h: '200' }
    },
    tickers_error: null,
    cursor: 0,
    foco: 'watchlist',
    intervalos: ['1m', '5m', '1h', '4h', '1d']
  };
  const ancho = anchoWatchlist(estado);
  const lineas = flatten(vistaWatchlist(estado, { width: ancho, height: 32 }), ancho, 32);
  const texto = lineas.map(linea => sanitize(linea.content));
  const fin = texto.findIndex(linea => linea.includes('╰'));

  for (const ayuda of lineasAyuda(estado.intervalos).filter(Boolean)) {
    assert.ok(texto.some(linea => linea.includes(ayuda)), 'falta la ayuda: ' + ayuda);
  }
  assert.match(texto[fin - 1], /q - Volver/);
  assert.equal(texto.length, 32);
});
