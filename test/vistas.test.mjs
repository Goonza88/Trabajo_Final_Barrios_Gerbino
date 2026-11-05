// tests de las vistas - medidas, paneles del monitor, ayuda y watchlist

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten } from '../backend/terminal/view.mjs';
import { sanitize, toAnsi } from '../backend/terminal/ansi.mjs';
import { seccionesAyuda, vistaMonitor } from '../frontend/vistas/monitor.mjs';
import { capacidadVelas, cantidadVelasVisibles, dimensiones, rangoVentanaVelas } from '../frontend/vistas/medidas.mjs';
import { crearEstado } from '../frontend/estado/mercado.mjs';
import { anchoWatchlist, vistaWatchlist } from '../frontend/features/watchlist.mjs';

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

test('la capacidad depende del ancho y modo tabla conserva ventana', () => {
  const estado = { zoomX: 80, intervalos: ['1m', '5m', '1h', '4h', '1d'], borrador: { entrada: null, take_profit: null, stop_loss: null } };
  const anchos = dimensiones(estado, 80, seccionesAyuda(estado.intervalos));
  const capacidad = capacidadVelas(anchos);

  assert.ok(capacidad > 0 && capacidad < estado.zoomX);
  assert.equal(cantidadVelasVisibles(estado, anchos), capacidad);
  assert.equal(cantidadVelasVisibles({ ...estado, zoomX: 20 }, anchos), 20);
  assert.equal(cantidadVelasVisibles({ ...estado, modoTabla: true }, anchos), 80);
});

test('la ventana muestra velas consecutivas', () => {
  assert.deepEqual(rangoVentanaVelas(10, 4), { inicio: 6, fin: 10, vacias: 0 });
  assert.deepEqual(rangoVentanaVelas(10, 4, 2), { inicio: 4, fin: 8, vacias: 0 });
  assert.deepEqual(rangoVentanaVelas(10, 4, 100), { inicio: 0, fin: 4, vacias: 0 });
  assert.deepEqual(rangoVentanaVelas(10, 4, -2), { inicio: 8, fin: 10, vacias: 2 }, 'offset negativo deja lugares vacios');
  assert.deepEqual(rangoVentanaVelas(10, 4, -100), { inicio: 9, fin: 10, vacias: 3 }, 'siempre queda una vela');
});

test('el monitor muestra velas consecutivas hasta el maximo que entra', () => {
  const estado = { zoomX: 80, intervalos: ['1m', '5m', '1h', '4h', '1d'], borrador: { entrada: null, take_profit: null, stop_loss: null } };
  const capacidad = cantidadVelasVisibles(estado, dimensiones(estado, 80, seccionesAyuda(estado.intervalos)));
  const fuente = velas(capacidad * 2);
  const { inicio, fin } = rangoVentanaVelas(fuente.length, capacidad);
  const visibles = fuente.slice(inicio, fin);

  assert.equal(visibles.length, capacidad);
  assert.equal(visibles.at(-1), fuente.at(-1));
  assert.ok(visibles.every((vela, i) => i === 0 || vela.open_time - visibles[i - 1].open_time === 60000));
});

test('el monitor pone rsi y volumen cada uno en su recuadro bajo el grafico', async () => {
  const { estado, cargar } = crearEstado({ cargarVelas: async () => velas(30) });
  await cargar();
  const texto = () => flatten(vistaMonitor(estado), 80, 24).map(linea => sanitize(linea.content)).join('\n');

  assert.doesNotMatch(texto(), /RSI 0-100/);
  estado.indicadores.rsi = true;
  estado.indicadores.volume = true;
  const lineas = texto().split('\n');
  const rsi = lineas.findIndex(linea => linea.includes('RSI 0-100'));
  const vol = lineas.findIndex(linea => linea.includes('VOL % max'));
  assert.ok(rsi > 0 && vol > rsi);
  for (const titulo of [rsi, vol]) {
    assert.match(lineas[titulo - 1], /╭─/, 'cada recuadro abre su propio borde');
    assert.match(lineas[titulo - 2], /╰─/, 'el de arriba cierra el suyo antes');
  }
  assert.equal(lineas.length, 24);

  estado.modoTabla = true;
  assert.doesNotMatch(texto(), /RSI 0-100/, 'la tabla no lleva recuadro');
});

test('la leyenda va a la derecha del titulo y resalta los indicadores encendidos', async () => {
  const { estado, cargar } = crearEstado({ cargarVelas: async () => velas(30) });
  await cargar();
  estado.indicadores.rsi = true;
  const anterior = process.stdout.columns;
  process.stdout.columns = 140;
  try {
    const lineas = flatten(vistaMonitor(estado), 140, 24);
    const primera = lineas[1].content;
    const texto = sanitize(primera);
    assert.match(texto, /│ BTCUSDT 1m \|.* 1:SMA20 2:EMA20 3:RSI14 4:VOL 5:BB20x2 │$/);
    assert.ok(primera.includes(toAnsi({ fg: 'muted' }) + '1:SMA20'), 'apagado va tenue');
    assert.ok(primera.includes(toAnsi({ fg: 'sec' }) + '3:RSI14'), 'encendido va resaltado');

    const textos = lineas.map(linea => sanitize(linea.content));
    const rsi = textos.findIndex(t => t.includes('RSI 0-100'));
    assert.match(textos[rsi], /\s{20,}RSI 0-100 │$/, 'el titulo del recuadro va a la derecha');
    assert.match(textos[rsi + 1], /│ 100 /, 'el carril arranca en la fila siguiente');
  } finally {
    process.stdout.columns = anterior;
  }
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
    { lineas: ['Enter - Seleccionar', 'Backspace - Quitar Simbolo', 'Tab - Cambiar Foco'], resumen: undefined },
    { lineas: ['h - Izquierda', 'j - Abajo', 'k - Arriba', 'l - Derecha'], resumen: 'h-l - Desplazar' },
    { lineas: ['y - Alejar Horizontal', 'u - Alejar Vertical', 'i - Acercar Vertical', 'o - Acercar Horizontal'], resumen: 'y-o - Zoom' },
    { lineas: ['q - Take Profit', 'w - Entrada Limite', 'e - Stop Loss', 'r - Entrada Mercado', 't - Diario'], resumen: 'q-t - Operacion' },
    { lineas: ['a - Intervalo 1m', 's - Intervalo 5m', 'd - Intervalo 1h', 'f - Intervalo 4h', 'g - Intervalo 1d'], resumen: 'a-g - Intervalos' },
    { lineas: ['z - Vista de Tabla', 'x - Iniciar Mira', 'c - Descartar Accion', 'v - Alerta'], resumen: undefined },
    { lineas: ['1 - Media Simple', '2 - Media Exponencial', '3 - RSI', '4 - Volumen', '5 - Bandas de Bollinger'], resumen: '1-5 - Indicadores' },
    { lineas: ['Esc - Volver'], resumen: undefined },
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
  assert.ok(texto.some(t => t.includes('q-t - Operacion')) && texto.some(t => t.includes('a-g - Intervalos')));
  assert.ok(texto.some(t => t.includes('1-5 - Indicadores')), 'y despues los indicadores');
  assert.ok(!texto.some(t => t.includes('h - Izquierda')));
  assert.ok(texto.some(t => t.includes('Enter - Seleccionar')) && texto.some(t => t.includes('z - Vista de Tabla')));

  const todos = Array.from({ length: 40 }, (_, i) => 'SIM' + i + 'USDT');
  const plegada = textoWatchlist(estadoWatchlist(todos), 32).texto;
  for (const resumen of ['h-l - Desplazar', 'y-o - Zoom', 'a-g - Intervalos', '1-5 - Indicadores']) {
    assert.ok(plegada.some(t => t.includes(resumen)), 'falta el resumen: ' + resumen);
  }
});

test('watchlist pega las ayudas al fondo y colorea la variacion 24h', () => {
  const { lineas, texto } = textoWatchlist(estadoWatchlist(['BTCUSDT', 'ETHUSDT']), 24);

  for (const linea of ['h-l - Desplazar', 'y-o - Zoom', 'q-t - Operacion', 'a-g - Intervalos', '1-5 - Indicadores']) {
    assert.ok(texto.some(t => t.includes(linea)), 'falta la ayuda: ' + linea);
  }
  assert.match(texto[22], /Esc - Volver/);
  assert.match(texto[23], /╰/);

  const btc = lineas.find(linea => sanitize(linea.content).includes('BTCUSDT'));
  const eth = lineas.find(linea => sanitize(linea.content).includes('ETHUSDT'));
  assert.ok(btc.content.includes(toAnsi({ fg: 'success' })));
  assert.ok(eth.content.includes(toAnsi({ fg: 'danger' })));
  assert.ok(btc.content.includes(toAnsi({ fg: 'accent' })));
  assert.ok(!btc.content.includes(toAnsi({ bg: 'selected' })));
});

test('watchlist muestra secciones completas cuando la terminal tiene altura', () => {
  const { texto } = textoWatchlist(estadoWatchlist(['BTCUSDT', 'ETHUSDT']), 47);
  const fin = texto.findIndex(linea => linea.includes('╰'));

  for (const linea of seccionesAyuda(['1m', '5m', '1h', '4h', '1d']).flatMap(seccion => seccion.lineas)) {
    assert.ok(texto.some(t => t.includes(linea)), 'falta la ayuda: ' + linea);
  }
  assert.equal(texto[fin - 2].trim(), '│                            │', 'con lugar las secciones van separadas');
  assert.match(texto[fin - 1], /Esc - Volver/);
  assert.equal(texto.length, 47);
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
