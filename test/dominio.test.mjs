// tests del dominio de mercado - pide al conector y normaliza antes de entregar

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCargarVelas, crearCargarTickers } from '../backend/dominio/mercado.mjs';

test('cargarVelas delega en el conector y normaliza la respuesta', async () => {
  const llamadas = [];
  const cargarVelas = crearCargarVelas({
    conectores: {
      binance: async (opciones) => {
        llamadas.push(opciones);
        return [[1, '100']];
      }
    },
    normalizar: (raw, meta) => raw.map(v => ({ ...meta, open_time: v[0], close: v[1] }))
  });

  const velas = await cargarVelas({
    exchange_id: 'binance',
    symbol: 'BTCUSDT',
    interval: '1m',
    limit: 2,
    signal: 'signal'
  });

  assert.deepEqual(llamadas, [{ symbol: 'BTCUSDT', interval: '1m', limit: 2, signal: 'signal' }]);
  assert.deepEqual(velas, [{
    exchange_id: 'binance',
    symbol: 'BTCUSDT',
    interval: '1m',
    open_time: 1,
    close: '100'
  }]);
});

test('cargarVelas rechaza un exchange desconocido sin llamar al conector', async () => {
  const cargarVelas = crearCargarVelas({
    conectores: {
      binance: async () => {
        throw new Error('no deberia llamarse');
      }
    }
  });

  await assert.rejects(
    () => cargarVelas({ exchange_id: 'otro', symbol: 'BTCUSDT', interval: '1m' }),
    /exchange no soportado: otro/
  );
});

test('cargarTickers delega la lista y normaliza la respuesta', async () => {
  const llamadas = [];
  const cargarTickers = crearCargarTickers({
    conectores: {
      binance: async (opciones) => {
        llamadas.push(opciones);
        return [{ symbol: 'BTCUSDT' }, { symbol: 'ETHUSDT' }];
      }
    },
    normalizar: (raw, meta) => raw.map(t => ({ ...meta, symbol: t.symbol }))
  });

  const tickers = await cargarTickers({
    exchange_id: 'binance',
    symbols: ['BTCUSDT', 'ETHUSDT', 'BTCUSDT'],
    signal: 'signal'
  });

  assert.deepEqual(llamadas, [{ symbols: ['BTCUSDT', 'ETHUSDT'], signal: 'signal' }]);
  assert.deepEqual(tickers, [
    { exchange_id: 'binance', symbol: 'BTCUSDT' },
    { exchange_id: 'binance', symbol: 'ETHUSDT' }
  ]);
});

test('cargarTickers valida la lista antes de llamar al conector', async () => {
  let llamadas = 0;
  const cargarTickers = crearCargarTickers({
    conectores: {
      binance: async () => {
        llamadas++;
        return [];
      }
    }
  });

  await assert.rejects(() => cargarTickers({ symbols: [] }), /symbols invalido/);
  await assert.rejects(() => cargarTickers({ symbols: ['BTCUSDT', ''] }), /symbols invalido/);
  assert.equal(llamadas, 0);
});

test('cargarTickers rechaza un exchange desconocido', async () => {
  const cargarTickers = crearCargarTickers({
    conectores: {
      binance: async () => {
        throw new Error('no deberia llamarse');
      }
    }
  });

  await assert.rejects(
    () => cargarTickers({ exchange_id: 'otro', symbols: ['BTCUSDT'] }),
    /exchange no soportado: otro/
  );
});
