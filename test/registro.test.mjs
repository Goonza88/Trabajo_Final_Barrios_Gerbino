// tests del registro - la sesion se guarda en la base y vuelve igual al abrirla de nuevo

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirRegistro } from '../backend/dominio/registro.mjs';
import { createData } from '../backend/datos/sqlite/index.mjs';
import { crearEstado } from '../frontend/estado/mercado.mjs';

// una base en archivo que se borra al terminar
function conArchivo(t) {
  const carpeta = mkdtempSync(path.join(os.tmpdir(), 'registro-'));
  t.after(() => rmSync(carpeta, { recursive: true, force: true }));
  return path.join(carpeta, 'app.db');
}

const vela = (open_time, low, high, close = high) => ({
  exchange_id: 'binance', symbol: 'BTCUSDT', interval: '1m', open_time,
  open: low, high, low, close, volume: '1', close_time: open_time + 59_999, quote_volume: '1', trades: 1, ingested_at: open_time,
});

test('la primera sesion arma la watchlist y las siguientes recuperan lo guardado', t => {
  const archivo = conArchivo(t);
  const inicio = { simbolos: ['ETHUSDT', 'BTCUSDT'], symbol: 'BTCUSDT', interval: '1m', saldo_inicial: '100' };

  const primero = abrirRegistro({ path: archivo, ahora: () => 1000 });
  const nueva = primero.cargarSesion(inicio);
  assert.deepEqual(nueva.simbolos, ['ETHUSDT', 'BTCUSDT']);
  assert.deepEqual([nueva.symbol, nueva.interval, nueva.saldo_inicial], ['BTCUSDT', '1m', '100']);
  primero.agregarSimbolo('SOLUSDT', { base: 'SOL', quote: 'USDT' });
  primero.quitarSimbolo('ETHUSDT');
  primero.guardarPreferencias({ symbol: 'SOLUSDT', interval: '1h', saldo_inicial: '100' });
  primero.cerrar();

  const segundo = abrirRegistro({ path: archivo, ahora: () => 2000 });
  const guardada = segundo.cargarSesion({ ...inicio, simbolos: ['XRPUSDT'] });
  assert.deepEqual(guardada.simbolos, ['BTCUSDT', 'SOLUSDT'], 'lo que llega no pisa la watchlist guardada');
  assert.deepEqual([guardada.symbol, guardada.interval], ['SOLUSDT', '1h']);
  segundo.cerrar();
});

test('operaciones y alertas pasan a la base cada cambio que decide el dominio', t => {
  const archivo = conArchivo(t);
  const registro = abrirRegistro({ path: archivo, ahora: () => 5000 });
  registro.cargarSesion({ simbolos: ['BTCUSDT'], symbol: 'BTCUSDT', interval: '1m', saldo_inicial: '100' });

  const base = { exchange_id: 'binance', symbol: 'XRPUSDT', lado: 'compra', tipo: 'limite', cantidad: '1', precio_entrada: '2', take_profit: '3', stop_loss: '1', precio_salida: null, fees: '0', estado: 'pendiente', notas: null, tags: [] };
  const pendiente = registro.registrarOperacion(base);
  assert.equal(pendiente.id, 1, 'un simbolo fuera del catalogo se registra solo');
  const cerrada = registro.guardarOperacion(pendiente, { ...pendiente, estado: 'cerrada', precio_salida: '3', motivo_cierre: 'tp', notas: '# bien' });
  assert.deepEqual([cerrada.estado, cerrada.abierta_en, cerrada.motivo_cierre, cerrada.notas], ['cerrada', 5000, 'tp', '# bien']);
  const otra = registro.registrarOperacion({ ...base, estado: 'abierta' });
  assert.equal(registro.guardarOperacion(otra, { ...otra, estado: 'cancelada' }).estado, 'cancelada');

  const alerta = registro.registrarAlerta({ exchange_id: 'binance', symbol: 'BTCUSDT', tipo: 'precio', campo: 'price', operador: 'cruza_arriba', valor: '110', timeframe: '1m', activa: 1, disparada: 0, created_at: 1 });
  const disparada = registro.guardarAlerta(alerta, { ...alerta, activa: 0, disparada: 1 });
  assert.deepEqual([disparada.activa, disparada.disparada, disparada.disparos], [0, 1, 1]);
  const borrar = registro.registrarAlerta({ ...alerta, valor: '90', operador: 'cruza_abajo' });
  registro.borrarAlerta(borrar.id);
  registro.cerrar();

  const datos = createData({ path: archivo });
  assert.deepEqual(datos.operations.listOperations().map(fila => fila.estado), ['cerrada', 'cancelada']);
  assert.deepEqual(datos.alerts.listAlerts().map(fila => fila.id), [alerta.id]);
  assert.equal(datos.catalog.listIntervals('binance', 'XRPUSDT').length, 5);
  datos.close();
});

test('las cargas usan la url del catalogo y guardan velas y tickers', async t => {
  const archivo = conArchivo(t);
  const urls = [];
  const respuestas = {
    '/api/v3/klines': [[60_000, '1', '2', '0.5', '1.5', '10', 119_999, '15', 3]],
    '/api/v3/ticker/24hr': [{ symbol: 'BTCUSDT', lastPrice: '1.5', closeTime: 120_000, openPrice: '1' }],
  };
  const fetch = async url => {
    urls.push(url);
    return { ok: true, text: async () => JSON.stringify(respuestas[url.pathname]) };
  };
  const registro = abrirRegistro({ path: archivo, fetch });
  await registro.mercado.cargarVelas({ symbol: 'BTCUSDT', interval: '1m', limit: 1 });
  await registro.mercado.cargarTickers({ symbols: ['BTCUSDT'] });
  registro.cerrar();
  assert.equal(urls[0].origin, 'https://data-api.binance.vision');

  const datos = createData({ path: archivo });
  assert.equal(datos.market.readCandles({ exchange_id: 'binance', symbol: 'BTCUSDT', interval: '1m' })[0].close, '1.5');
  assert.equal(datos.market.readLastTicker('binance', 'BTCUSDT').price, '1.5');
  datos.close();
});

test('la app guarda su sesion y la recupera entera al volver a abrirla', async t => {
  const archivo = conArchivo(t);
  let instante = 100_000;
  const ahora = () => instante;
  let velas = [vela(60_000, '95', '100')];
  const opciones = () => ({
    simbolos: ['BTCUSDT', 'ETHUSDT'],
    ahora,
    registro: abrirRegistro({ path: archivo, ahora }),
    cargarVelas: async () => velas,
    cargarTickers: async () => [],
  });

  const primera = crearEstado(opciones());
  await primera.cargar();
  primera.fijarEntrada('limite', '90');
  primera.fijarNivel('take_profit', '120');
  primera.confirmarBorrador();
  primera.agregarAlerta('110');
  await primera.setIntervalo('5m');
  assert.equal(primera.estado.operaciones[0].estado, 'pendiente');

  // una vela toca la entrada y despues el take profit
  instante = 200_000;
  velas = [vela(120_000, '85', '125')];
  await primera.cargar();
  assert.equal(primera.estado.operaciones[0].estado, 'cerrada');
  assert.equal(primera.estado.alertas[0].activa, 0);
  primera.alternarDiario();
  primera.empezarNotas();
  for (const tecla of ['b', 'i', 'e', 'n', 'Esc']) primera.teclearNotas(tecla);

  const segunda = crearEstado(opciones());
  const { estado } = segunda;
  assert.equal(estado.interval, '5m');
  assert.deepEqual(estado.operaciones.map(({ id, estado, motivo_cierre, notas }) => [id, estado, motivo_cierre, notas]), [[1, 'cerrada', 'tp', 'bien']]);
  assert.deepEqual(estado.alertas.map(({ valor, disparada }) => [valor, disparada]), [['110', 1]]);
});
