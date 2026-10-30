// tests del estado de mercado - cargas superpuestas, errores y cancelacion

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEstado } from '../frontend/estado/mercado.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function vela(i, close = '100') {
  return {
    exchange_id: 'binance',
    symbol: 'BTCUSDT',
    interval: '1m',
    open_time: i * 60000,
    open: '100',
    high: '101',
    low: '99',
    close,
    volume: '1',
    close_time: i * 60000 + 59999,
    quote_volume: '1',
    trades: 2,
    ingested_at: i * 60000
  };
}

test('una carga vieja no pisa a la nueva', async () => {
  const pendientes = [];
  const llamadas = [];
  const fake = (opciones) => {
    const d = deferred();
    llamadas.push(opciones);
    pendientes.push(d);
    return d.promise;
  };
  const { estado, cargar } = crearEstado({ cargarVelas: fake });

  const primera = cargar();
  const segunda = cargar();
  assert.equal(pendientes.length, 2);
  assert.equal(llamadas[0].signal.aborted, true);

  pendientes[1].resolve([vela(1, '200')]);
  await segunda;
  pendientes[0].resolve([vela(0, '100')]);
  await primera;

  assert.equal(estado.velas.length, 1);
  assert.equal(estado.velas[0].close, '200');
  assert.equal(estado.error, null);
});

test('un error se muestra y la carga siguiente lo limpia', async () => {
  let llamadas = 0;
  const fake = () => {
    llamadas++;
    return llamadas === 1 ? Promise.reject(new Error('boom')) : Promise.resolve([vela(0)]);
  };
  const { estado, cargar } = crearEstado({ cargarVelas: fake });

  await cargar();
  assert.equal(estado.error, 'boom');

  await cargar();
  assert.equal(estado.error, null);
  assert.equal(estado.velas.length, 1);
});

test('cancelar descarta la respuesta pendiente', async () => {
  const pendiente = deferred();
  const { estado, cargar, cancelar } = crearEstado({ cargarVelas: () => pendiente.promise });

  const carga = cargar();
  cancelar();
  pendiente.resolve([vela(0)]);
  await carga;

  assert.deepEqual(estado.velas, []);
  assert.equal(estado.error, null);
});

test('cambiar de intervalo recarga con el intervalo nuevo', async () => {
  const llamadas = [];
  const fake = opciones => {
    llamadas.push(opciones);
    return Promise.resolve([vela(0)]);
  };
  const { estado, setIntervalo } = crearEstado({ cargarVelas: fake });

  await setIntervalo('5m');
  assert.equal(estado.interval, '5m');
  assert.equal(llamadas.at(-1).interval, '5m');
});
