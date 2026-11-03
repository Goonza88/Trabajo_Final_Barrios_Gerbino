// tests del grafico de velas - produce un grid exacto y sin ANSI

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten } from '../backend/terminal/view.mjs';
import { sanitize, toAnsi } from '../backend/terminal/ansi.mjs';
import { anchoPlot, graficoVelas, limitarVelas, tablaVelas } from '../frontend/graficos/velas.mjs';
import { capacidadVelas, cantidadVelasVisibles, rangoVentanaVelas, seccionesAyuda, vistaMonitor } from '../frontend/vistas/monitor.mjs';
import { crearEstado } from '../frontend/estado/mercado.mjs';
import { anchoWatchlist, vistaWatchlist } from '../frontend/features/watchlist.mjs';

// mitades de arriba y de abajo de cada trazo, y las rayas de un cuerpo sin alto
const MITADES = {
  '╵': ['mecha', ''], '╷': ['', 'mecha'], '│': ['mecha', 'mecha'],
  '╹': ['cuerpo', ''], '╻': ['', 'cuerpo'], '┃': ['cuerpo', 'cuerpo'],
  '╽': ['mecha', 'cuerpo'], '╿': ['cuerpo', 'mecha'],
};
const RAYAS = { '┿': ['mecha', 'mecha'], '┷': ['mecha', ''], '┯': ['', 'mecha'], '━': ['', ''] };

// lee una columna del grafico - bordes del cuerpo en filas (el limite de arriba de la fila r es
// r - 0.5) y si mecha y cuerpo forman una sola linea sin huecos
function leerVela(node, col) {
  const mitades = [];
  let raya = null;
  for (let row = 0; row < node.cells.length; row++) {
    const celda = node.cells[row][col];
    if (celda && RAYAS[celda.ch]) raya = row;
    mitades.push(...(celda && (RAYAS[celda.ch] ?? MITADES[celda.ch])) || ['', '']);
  }
  const cuerpo = mitades.flatMap((mitad, s) => mitad === 'cuerpo' ? [s] : []);
  const ocupadas = mitades.flatMap((mitad, s) => mitad ? [s] : []);
  const continua = ocupadas.every((s, i) => i === 0 || s === ocupadas[i - 1] + 1)
    && (raya == null || !ocupadas.length || (ocupadas[0] <= 2 * raya + 1 && ocupadas.at(-1) >= 2 * raya));
  if (raya != null) return { top: raya, bottom: raya, raya: true, continua };
  if (!cuerpo.length) return { top: NaN, bottom: NaN, raya: false, continua };
  return { top: cuerpo[0] / 2 - 0.5, bottom: (cuerpo.at(-1) + 1) / 2 - 0.5, raya: false, continua };
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
  // velas rojas - el cierre es el borde de abajo y la apertura el de arriba
  assert.equal(leerVela(node, 0).bottom, leerVela(node, 1).top);
});

test('la mecha siempre toca el cuerpo', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '110', high: '113.3', low: '96.4', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '101.7', low: '88.2', close: '90', volume: '1' },
      { open_time: 120000, open: '90', high: '104.1', low: '89.6', close: '103.2', volume: '1' },
    ],
    width: 3,
    height: 12,
    showAxis: false,
  });
  for (let col = 0; col < 3; col++) assert.ok(leerVela(node, col).continua, 'hueco en la vela ' + col);
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
  const primera = leerVela(node, 0);
  const segunda = leerVela(node, 1);

  assert.equal(primera.bottom, segunda.top);
  assert.equal(primera.bottom % 1, 0.5, 'el borde cae justo entre dos filas');
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

  assert.ok(Number.isFinite(leerVela(node, 0).top));
  assert.ok(Number.isFinite(leerVela(node, 1).top));
});

test('un doji en el medio de una fila es una raya cruzada por la mecha', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '100', high: '110', low: '90', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '100', low: '90', close: '100', volume: '1' },
      { open_time: 120000, open: '100', high: '110', low: '100', close: '100', volume: '1' },
    ],
    width: 3,
    height: 3,
    showAxis: false,
  });

  assert.deepEqual([0, 1, 2].map(col => node.cells[1][col]?.ch), ['┿', '┯', '┷']);
  assert.ok([0, 1, 2].every(col => leerVela(node, col).continua));
});

test('dos velas verdes con un cuerpo corto empalman sus bordes', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '100', high: '100.5', low: '98.5', close: '100.5', volume: '1' },
      { open_time: 60000, open: '100.5', high: '111', low: '100.5', close: '101', volume: '1' },
    ],
    width: 2,
    height: 8,
    showAxis: false,
  });
  // en una vela verde el cierre es el borde de arriba y la apertura el de abajo
  assert.equal(leerVela(node, 0).top, leerVela(node, 1).bottom);
});

test('dos velas rojas con un cuerpo corto empalman sus bordes', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '101', high: '101', low: '98.5', close: '100.5', volume: '1' },
      { open_time: 60000, open: '100.5', high: '111', low: '100', close: '100', volume: '1' },
    ],
    width: 2,
    height: 8,
    showAxis: false,
  });
  assert.equal(leerVela(node, 0).bottom, leerVela(node, 1).top);
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
  const doji = leerVela(node, 0);
  const apertura = leerVela(node, 1).bottom;
  assert.ok(doji.top === apertura || doji.bottom === apertura);
});

test('un cuerpo corto entre dos cuerpos largos empalma al menos un lado', () => {
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
  const [primera, segunda, tercera] = [0, 1, 2].map(col => leerVela(node, col));

  const entrada = Math.abs(primera.top - segunda.bottom);
  const salida = Math.abs(segunda.top - tercera.top);
  assert.ok(Math.max(entrada, salida) <= 0.5);
  assert.equal(Math.min(entrada, salida), 0);
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
  assert.deepEqual(rangoVentanaVelas(10, 4), { inicio: 6, fin: 10 });
  assert.deepEqual(rangoVentanaVelas(10, 4, 2), { inicio: 4, fin: 8 });
  assert.deepEqual(rangoVentanaVelas(10, 4, 100), { inicio: 0, fin: 4 });
});

test('el monitor muestra velas consecutivas hasta el maximo que entra', () => {
  const estado = { zoomX: 80, intervalos: ['1m', '5m', '1h', '4h', '1d'] };
  const capacidad = cantidadVelasVisibles(estado, 80);
  const fuente = velas(capacidad * 2);
  const { inicio, fin } = rangoVentanaVelas(fuente.length, capacidad);
  const visibles = fuente.slice(inicio, fin);

  assert.equal(visibles.length, capacidad);
  assert.equal(visibles.at(-1), fuente.at(-1));
  assert.ok(visibles.every((vela, i) => i === 0 || vela.open_time - visibles[i - 1].open_time === 60000));
});

test('vistaMonitor compone watchlist y grafico sin romper', async () => {
  const { estado, cargar, cargarTickers } = crearEstado({
    simbolos: ['BTCUSDT', 'ETHUSDT'],
    cargarVelas: async () => velas(12),
    cargarTickers: async () => [
      { symbol: 'BTCUSDT', price: '111', open_24h: '100' },
      { symbol: 'ETHUSDT', price: '180', open_24h: '200' }
    ]
  });
  await Promise.all([cargar(), cargarTickers()]);
  estado.foco = 'watchlist';
  estado.zoomX = 12;

  const lineas = flatten(vistaMonitor(estado), 80, 24);
  const texto = sanitize(lineas.map(linea => linea.content).join('\n'));
  assert.match(texto, /watchlist/);
  assert.match(texto, /BTCUSDT/);
  assert.match(texto, /ETHUSDT/);
  assert.match(texto, /\+11\.00%/);
  assert.match(texto, /-10\.00%/);
  estado.modoTabla = true;
  assert.doesNotThrow(() => flatten(vistaMonitor(estado), 80, 24));
});

test('el monitor arma la ayuda por secciones y la watchlist calcula el ancho para no cortarlas', () => {
  const secciones = seccionesAyuda(['1m', '5m', '1h', '4h', '1d']);
  assert.deepEqual(secciones, [
    { lineas: ['Enter - Seleccionar', 'Tab - Cambiar Foco'], resumen: undefined },
    { lineas: ['h - Izquierda', 'j - Abajo', 'k - Arriba', 'l - Derecha'], resumen: 'h-l - Desplazar' },
    { lineas: ['y - Alejar Horizontal', 'u - Alejar Vertical', 'i - Acercar Vertical', 'o - Acercar Horizontal'], resumen: 'y-o - Zoom' },
    { lineas: ['t - Vista de Tabla'], resumen: undefined },
    { lineas: ['a - Intervalo 1m', 's - Intervalo 5m', 'd - Intervalo 1h', 'f - Intervalo 4h', 'g - Intervalo 1d'], resumen: 'a-g - Intervalos' },
    { lineas: ['1 - Media Simple', '2 - Media Exponencial', '3 - RSI', '4 - Volumen', '5 - Bandas de Bollinger'], resumen: '1-5 - Indicadores' },
    { lineas: ['q - Volver'], resumen: undefined },
  ]);
  const ancho = anchoWatchlist(secciones);
  const lineas = secciones.flatMap(seccion => seccion.lineas);
  assert.ok(ancho >= Math.max(...lineas.map(linea => linea.length)) + 4);
});

function estadoWatchlist(simbolos) {
  return {
    symbol: simbolos[0],
    simbolos,
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
}

function textoWatchlist(estado, alto) {
  const ayuda = seccionesAyuda(estado.intervalos);
  const ancho = anchoWatchlist(ayuda);
  const lineas = flatten(vistaWatchlist(estado, { width: ancho, height: alto, ayuda }), ancho, alto);
  return { lineas, texto: lineas.map(linea => sanitize(linea.content)) };
}

test('la ayuda pliega sus secciones de arriba hacia abajo hasta que entran todos los simbolos', () => {
  const muchos = Array.from({ length: 10 }, (_, i) => 'SIM' + i + 'USDT');
  const { texto } = textoWatchlist(estadoWatchlist(muchos), 32);

  assert.ok(muchos.every(symbol => texto.some(t => t.includes(symbol))), 'entran todos los simbolos');
  assert.ok(texto.some(t => t.includes('h-l - Desplazar')));
  assert.ok(texto.some(t => t.includes('y-o - Zoom')));
  assert.ok(texto.some(t => t.includes('a - Intervalo 1m')), 'los intervalos siguen completos');
  assert.ok(!texto.some(t => t.includes('h - Izquierda')));
  assert.ok(texto.some(t => t.includes('Enter - Seleccionar')) && texto.some(t => t.includes('t - Vista de Tabla')));

  const todos = Array.from({ length: 40 }, (_, i) => 'SIM' + i + 'USDT');
  const plegada = textoWatchlist(estadoWatchlist(todos), 32).texto;
  for (const resumen of ['h-l - Desplazar', 'y-o - Zoom', 'a-g - Intervalos', '1-5 - Indicadores']) {
    assert.ok(plegada.some(t => t.includes(resumen)), 'falta el resumen: ' + resumen);
  }
});

test('watchlist pega las ayudas al fondo y colorea la variacion 24h', () => {
  const { lineas, texto } = textoWatchlist(estadoWatchlist(['BTCUSDT', 'ETHUSDT']), 24);

  for (const linea of ['h-l - Desplazar', 'y-o - Zoom', 'a - Intervalo 1m', '5 - Bandas de Bollinger']) {
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
  const { texto } = textoWatchlist(estadoWatchlist(['BTCUSDT', 'ETHUSDT']), 36);
  const fin = texto.findIndex(linea => linea.includes('╰'));

  for (const linea of seccionesAyuda(['1m', '5m', '1h', '4h', '1d']).flatMap(seccion => seccion.lineas)) {
    assert.ok(texto.some(t => t.includes(linea)), 'falta la ayuda: ' + linea);
  }
  assert.equal(texto[fin - 2].trim(), '│                            │', 'con lugar las secciones van separadas');
  assert.match(texto[fin - 1], /q - Volver/);
  assert.equal(texto.length, 36);
});

test('la tabla pinta los valores de cada fila con el color de su vela', () => {
  const verde = { open_time: 0, open: '10', high: '12', low: '9', close: '11', volume: '5' };
  const roja = { open_time: 60000, open: '11', high: '12', low: '8', close: '10', volume: '6' };
  const [primera, segunda] = tablaVelas([verde, roja]).rows;
  assert.ok(primera.slice(1).every(celda => celda.style.fg === 'danger'), 'la mas reciente va arriba');
  assert.ok(segunda.slice(1).every(celda => celda.style.fg === 'success'));
});

test('la tabla muestra el volumen con al menos dos digitos enteros', () => {
  const vela = volume => ({ open_time: 0, open: '1', high: '1', low: '1', close: '1', volume });
  const volumenes = ['9.5', '0.25', '8', '12.5', '123'].map(v => tablaVelas([vela(v)]).rows[0][5].text);
  assert.deepEqual(volumenes, ['09.5', '00.25', '08', '12.5', '123']);
});

test('la cabecera toma el precio de la ultima vela o del ticker mientras no hay velas', async () => {
  const { estado, cargar, cargarTickers } = crearEstado({
    cargarVelas: async () => velas(3),
    cargarTickers: async () => [{ symbol: 'BTCUSDT', price: '999.5', open_24h: '1000' }]
  });
  await cargarTickers();
  const cabecera = () => sanitize(flatten(vistaMonitor(estado), 80, 24).map(l => l.content).join('\n'));

  assert.match(cabecera(), /BTCUSDT 1m \| 999\.5 \|/);
  await cargar();
  assert.match(cabecera(), new RegExp('BTCUSDT 1m \\| ' + estado.velas.at(-1).close + ' \\|'));
});
