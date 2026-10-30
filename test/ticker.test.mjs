// tests del ticker - conector multi-simbolo y normalizacion al contrato

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearBinance } from '../backend/red/binance.mjs';
import { normalizarTicker, normalizarTickers } from '../backend/red/normalizar.mjs';

const raw = {
  symbol: 'BTCUSDT',
  lastPrice: '100.5',
  openPrice: '99.0',
  highPrice: '101.0',
  lowPrice: '98.0',
  volume: '10.5',
  quoteVolume: '1000.25',
  closeTime: 1700000000000
};

test('normaliza un ticker completo', () => {
  assert.deepEqual(normalizarTicker(raw), {
    exchange_id: 'binance',
    symbol: 'BTCUSDT',
    timestamp: 1700000000000,
    price: '100.5',
    open_24h: '99.0',
    high_24h: '101.0',
    low_24h: '98.0',
    volume_24h: '10.5',
    quote_volume_24h: '1000.25'
  });
});

test('normalizarTickers acepta una lista o un objeto', () => {
  const segundo = { ...raw, symbol: 'ETHUSDT', lastPrice: '200' };
  const lista = normalizarTickers([raw, segundo]);
  assert.equal(lista.length, 2);
  assert.equal(lista[1].symbol, 'ETHUSDT');

  const uno = normalizarTickers(raw);
  assert.equal(uno.length, 1);
  assert.equal(uno[0].symbol, 'BTCUSDT');
});

test('los campos 24h opcionales quedan en null', () => {
  const [ticker] = normalizarTickers({ symbol: 'BTCUSDT', lastPrice: '1', closeTime: 1 });
  assert.equal(ticker.open_24h, null);
  assert.equal(ticker.high_24h, null);
  assert.equal(ticker.low_24h, null);
  assert.equal(ticker.volume_24h, null);
  assert.equal(ticker.quote_volume_24h, null);
});

test('rechaza tickers fuera del contrato', () => {
  assert.throws(() => normalizarTicker(null), /normalizarTicker: ticker invalido/);
  assert.throws(() => normalizarTicker({ ...raw, lastPrice: '1e-8' }), /normalizarTicker: price invalido/);
  assert.throws(() => normalizarTicker({ ...raw, closeTime: -1 }), /normalizarTicker: timestamp invalido/);
  assert.throws(() => normalizarTicker({ ...raw, symbol: '' }), /normalizarTicker: symbol invalido/);
  assert.throws(() => normalizarTickers('no'), /normalizarTicker: ticker invalido/);
});

test('tickers24h pide varios simbolos en un solo request', async () => {
  const llamadas = [];
  const binance = crearBinance({
    fetch: async (url, opciones) => {
      llamadas.push({ url, opciones });
      return { ok: true, text: async () => JSON.stringify([raw]) };
    }
  });

  const salida = await binance.tickers24h({
    symbols: ['BTCUSDT', 'ETHUSDT', 'BTCUSDT'],
    signal: 'signal',
    timeout: 0
  });

  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].url.origin, 'https://data-api.binance.vision');
  assert.equal(llamadas[0].url.pathname, '/api/v3/ticker/24hr');
  assert.deepEqual(JSON.parse(llamadas[0].url.searchParams.get('symbols')), ['BTCUSDT', 'ETHUSDT']);
  assert.equal(llamadas[0].opciones.signal, 'signal');
  assert.deepEqual(salida, [raw]);
});

test('tickers24h valida la lista antes de pedir', async () => {
  const binance = crearBinance({
    fetch: async () => {
      throw new Error('no deberia llamarse');
    }
  });

  await assert.rejects(() => binance.tickers24h({ symbols: [] }), /binance: symbols invalido/);
  await assert.rejects(() => binance.tickers24h({ symbols: ['BTCUSDT', ''] }), /binance: symbols invalido/);
});

test('tickers24h informa errores http y timeout', async () => {
  const http = crearBinance({
    fetch: async () => ({ ok: false, status: 418, text: async () => 'teapot' })
  });
  await assert.rejects(
    () => http.tickers24h({ symbols: ['BTCUSDT'], timeout: 0 }),
    /binance http 418: teapot/
  );

  const timeout = crearBinance({
    fetch: async () => {
      const error = new Error('tarde');
      error.name = 'TimeoutError';
      throw error;
    }
  });
  await assert.rejects(
    () => timeout.tickers24h({ symbols: ['BTCUSDT'], timeout: 0 }),
    /binance: timeout/
  );
});

test('klines sigue usando el endpoint de velas', async () => {
  let pedido = null;
  const binance = crearBinance({
    fetch: async (url, opciones) => {
      pedido = { url, opciones };
      return { ok: true, text: async () => '[]' };
    }
  });

  await binance.klines({ symbol: 'ETHUSDT', interval: '5m', limit: 2, timeout: 0 });
  assert.equal(pedido.url.pathname, '/api/v3/klines');
  assert.equal(pedido.url.searchParams.get('symbol'), 'ETHUSDT');
  assert.equal(pedido.url.searchParams.get('interval'), '5m');
  assert.equal(pedido.url.searchParams.get('limit'), '2');
});
