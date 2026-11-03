// tests del grafico de velas - produce un grid exacto y sin ANSI

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten } from '../backend/terminal/view.mjs';
import { sanitize, toAnsi } from '../backend/terminal/ansi.mjs';
import { anchoPlot, graficoVelas, limitarVelas } from '../frontend/graficos/velas.mjs';
import { capacidadVelas, cantidadVelasVisibles, lineasAyuda, ventanaVelas, vistaMonitor } from '../frontend/vistas/monitor.mjs';
import { anchoWatchlist, vistaWatchlist } from '../frontend/features/watchlist.mjs';
import { calcularIndicadores } from '../backend/dominio/indicadores.mjs';

const BLOQUES = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function celdasCuerpo(node, col) {
  const celdas = [];
  for (let row = 0; row < node.cells.length; row++) {
    const celda = node.cells[row][col];
    if (!celda || (celda.style?.fg !== 'success' && celda.style?.fg !== 'danger')) continue;
    const k = BLOQUES.indexOf(celda.ch);
    if (k > 0) celdas.push({ row, k, ch: celda.ch, reverse: Boolean(celda.style.reverse) });
  }
  return celdas;
}

// recupera la coord del borde desde el bloque de una punta del cuerpo
function bordeY(celda, esInferior) {
  const rowTop = celda.row - 0.5;
  if (celda.k === 8) return rowTop + (esInferior ? 1 : 0);
  const borde = rowTop + (8 - celda.k) / 8;
  return celda.reverse
    ? (esInferior ? borde : rowTop)
    : (esInferior ? rowTop + 1 : borde);
}

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

test('cierre de una vela y apertura de la siguiente comparten el mismo borde', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '110', high: '110', low: '99', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '101', low: '90', close: '90', volume: '1' },
    ],
    width: 2,
    height: 12,
    showAxis: false,
  });
  const primera = celdasCuerpo(node, 0);
  const segunda = celdasCuerpo(node, 1);

  assert.ok(primera.length > 0);
  assert.ok(segunda.length > 0);
  assert.equal(bordeY(primera.at(-1), true), bordeY(segunda[0], false));
});

test('la punta de la mecha no reemplaza el borde exacto del cuerpo', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '110', high: '110', low: '99.6', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '101', low: '90', close: '90', volume: '1' },
    ],
    width: 2,
    height: 12,
    showAxis: false,
  });
  const ultima = celdasCuerpo(node, 0).at(-1);

  assert.ok(ultima);
  assert.ok(ultima.k < 8, 'el cierre debe quedar en un borde parcial, no en una fila completa');
  assert.equal(ultima.reverse, true);
});

test('un borde de cuerpo en el limite de fila no deja hueco', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '121', high: '121', low: '105', close: '110', volume: '1' },
      { open_time: 60000, open: '110', high: '115', low: '100', close: '100', volume: '1' },
    ],
    width: 2,
    height: 12,
    showAxis: false,
  });
  const primera = celdasCuerpo(node, 0);
  const segunda = celdasCuerpo(node, 1);

  assert.deepEqual(primera.map(celda => celda.row), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(segunda.map(celda => celda.row), [6, 7, 8, 9, 10, 11]);
  assert.equal(primera.at(-1).k, 8);
  assert.equal(segunda[0].k, 8);
  assert.equal(bordeY(primera.at(-1), true), bordeY(segunda[0], false));
});

test('un doji sigue siendo visible', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '100', high: '100', low: '100', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '100', low: '100', close: '100', volume: '1' },
    ],
    width: 2,
    height: 12,
    showAxis: false,
  });

  assert.ok(celdasCuerpo(node, 0).length > 0);
  assert.ok(celdasCuerpo(node, 1).length > 0);
});

test('dos velas verdes con un cuerpo de una fila empalman sus bordes', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '100', high: '100.5', low: '98.5', close: '100.5', volume: '1' },
      { open_time: 60000, open: '100.5', high: '111', low: '100.5', close: '101', volume: '1' },
    ],
    width: 2,
    height: 8,
    showAxis: false,
  });
  const primera = celdasCuerpo(node, 0);
  const segunda = celdasCuerpo(node, 1);

  assert.equal(primera.length, 1);
  // en una vela verde el cierre es el borde superior y la apertura el inferior
  assert.equal(bordeY(primera[0], false), bordeY(segunda.at(-1), true));
});

test('dos velas rojas con un cuerpo de una fila empalman sus bordes', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '101', high: '101', low: '98.5', close: '100.5', volume: '1' },
      { open_time: 60000, open: '100.5', high: '111', low: '100', close: '100', volume: '1' },
    ],
    width: 2,
    height: 8,
    showAxis: false,
  });
  const primera = celdasCuerpo(node, 0);
  const segunda = celdasCuerpo(node, 1);

  assert.equal(primera.length, 1);
  // en una vela roja el cierre es el borde inferior y la apertura el superior
  assert.equal(bordeY(primera.at(-1), true), bordeY(segunda[0], false));
});

test('un doji empalma con la apertura de la vela siguiente', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '100', high: '100', low: '100', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '100.5', low: '99', close: '100.5', volume: '1' },
    ],
    width: 2,
    height: 8,
    showAxis: false,
  });
  const doji = celdasCuerpo(node, 0);
  const siguiente = celdasCuerpo(node, 1);

  assert.ok(doji.length > 0);
  assert.ok(siguiente.length > 0);
  const bordeDoji = bordeY(doji[0], doji[0].reverse);
  assert.equal(bordeDoji, bordeY(siguiente.at(-1), true));
});

test('un cuerpo corto entre dos cuerpos largos elige el empalme de menor hueco', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '101', high: '110', low: '100', close: '105', volume: '1' },
      { open_time: 60000, open: '105', high: '110', low: '100', close: '105.5', volume: '1' },
      { open_time: 120000, open: '105.5', high: '110', low: '100', close: '101', volume: '1' },
    ],
    width: 3,
    height: 8,
    showAxis: false,
  });
  const primera = celdasCuerpo(node, 0);
  const segunda = celdasCuerpo(node, 1);
  const tercera = celdasCuerpo(node, 2);

  assert.ok(primera.length > 1);
  assert.equal(segunda.length, 1);
  assert.ok(tercera.length > 1);

  const entrada = Math.abs(bordeY(primera[0], false) - bordeY(segunda.at(-1), true));
  const salida = Math.abs(bordeY(segunda[0], false) - bordeY(tercera[0], false));
  assert.ok(entrada <= 1 / 8 + 1e-9);
  assert.ok(salida <= 1 / 8 + 1e-9);
  assert.ok(Math.min(entrada, salida) < 1e-9);
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

test('el grafico muestra solo velas reales que entran en el area', () => {
  const fuente = velas(12);
  const capacidad = anchoPlot(13, true);
  const visibles = limitarVelas(fuente, capacidad);
  const node = graficoVelas({ velas: fuente, width: 13, height: 8 });

  assert.equal(capacidad, 4);
  assert.equal(visibles.length, capacidad);
  assert.deepEqual(visibles, fuente.slice(-capacidad));
  assert.equal(node.width, 13);
  assert.equal(node.height, 8);
});

test('la capacidad depende del ancho y modo tabla conserva ventana', () => {
  const estado = { zoomX: 80, intervalos: ['1m', '5m', '1h', '4h', '1d'] };
  const capacidad = capacidadVelas(estado, 80);

  assert.ok(capacidad > 0 && capacidad < estado.zoomX);
  assert.equal(cantidadVelasVisibles(estado, 80), capacidad);
  assert.equal(cantidadVelasVisibles({ ...estado, zoomX: 20 }, 80), 20);
  assert.equal(cantidadVelasVisibles({ ...estado, modoTabla: true }, 80), 80);
});

test('la ventana muestra velas consecutivas', () => {
  const fuente = velas(10);

  assert.deepEqual(ventanaVelas(fuente, 4), fuente.slice(6));
  assert.deepEqual(ventanaVelas(fuente, 4, 2), fuente.slice(4, 8));
  assert.deepEqual(ventanaVelas(fuente, 4, 100), fuente.slice(0, 4));
});

test('el monitor muestra velas consecutivas hasta el maximo que entra', () => {
  const estado = { zoomX: 80, intervalos: ['1m', '5m', '1h', '4h', '1d'] };
  const capacidad = cantidadVelasVisibles(estado, 80);
  const fuente = velas(capacidad * 2);
  const visibles = ventanaVelas(fuente, capacidad);

  assert.equal(visibles.length, capacidad);
  assert.equal(visibles.at(-1), fuente.at(-1));
  assert.ok(visibles.every((vela, i) => i === 0 || vela.open_time - visibles[i - 1].open_time === 60000));
});

test('vistaMonitor compone watchlist y grafico sin romper', () => {
  const estado = {
    symbol: 'BTCUSDT',
    simbolos: ['BTCUSDT', 'ETHUSDT'],
    tickers: {
      BTCUSDT: { symbol: 'BTCUSDT', price: '111', open_24h: '100' },
      ETHUSDT: { symbol: 'ETHUSDT', price: '180', open_24h: '200' }
    },
    variaciones: { BTCUSDT: 11, ETHUSDT: -10 },
    tickers_error: null,
    cursor: 0,
    foco: 'watchlist',
    interval: '1m',
    velas: velas(12),
    series: calcularIndicadores(velas(12)),
    error: null,
    ultimo: '111',
    actualizado_en: Date.now(),
    zoomX: 12,
    offset: 0,
    zoomY: 1,
    offsetY: 0,
    precision: false,
    modoTabla: false,
    intervalos: ['1m', '5m', '1h', '4h', '1d'],
  };
  const lineas = flatten(vistaMonitor(estado), 80, 24);
  const texto = sanitize(lineas.map(linea => linea.content).join('\n'));
  assert.match(texto, /watchlist/);
  assert.match(texto, /BTCUSDT/);
  assert.match(texto, /ETHUSDT/);
  assert.match(texto, /\+11\.00%/);
  assert.match(texto, /-10\.00%/);
  assert.doesNotThrow(() => flatten(vistaMonitor({ ...estado, tickers: Object.values(estado.tickers), foco: 'grafico', modoTabla: true }), 80, 24));
});

test('el monitor arma una ayuda por atajo y la watchlist calcula el ancho para no cortarlas', () => {
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
  const ancho = anchoWatchlist(ayudas);
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
    variaciones: { BTCUSDT: 11, ETHUSDT: -10 },
    tickers_error: null,
    cursor: 0,
    foco: 'watchlist',
    intervalos: ['1m', '5m', '1h', '4h', '1d']
  };
  const ayuda = lineasAyuda(estado.intervalos);
  const ancho = anchoWatchlist(ayuda);
  const lineas = flatten(vistaWatchlist(estado, { width: ancho, height: 24, ayuda }), ancho, 24);
  const texto = lineas.map(linea => sanitize(linea.content));

  for (const linea of ayuda.filter(Boolean)) {
    assert.ok(texto.some(t => t.includes(linea)), 'falta la ayuda: ' + linea);
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
    variaciones: { BTCUSDT: 11, ETHUSDT: -10 },
    tickers_error: null,
    cursor: 0,
    foco: 'watchlist',
    intervalos: ['1m', '5m', '1h', '4h', '1d']
  };
  const ayuda = lineasAyuda(estado.intervalos);
  const ancho = anchoWatchlist(ayuda);
  const lineas = flatten(vistaWatchlist(estado, { width: ancho, height: 32, ayuda }), ancho, 32);
  const texto = lineas.map(linea => sanitize(linea.content));
  const fin = texto.findIndex(linea => linea.includes('╰'));

  for (const linea of ayuda.filter(Boolean)) {
    assert.ok(texto.some(t => t.includes(linea)), 'falta la ayuda: ' + linea);
  }
  assert.match(texto[fin - 1], /q - Volver/);
  assert.equal(texto.length, 32);
});
