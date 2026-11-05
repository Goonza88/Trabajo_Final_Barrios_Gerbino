// tests de simbolos del exchange - lista de precios, datos de uno y buscador

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearBinance } from '../backend/red/binance.mjs';
import { normalizarPrecios, normalizarSimbolo } from '../backend/red/normalizar.mjs';
import { buscarSimbolos, crearCargarSimbolos, crearValidarSimbolo } from '../backend/dominio/mercado.mjs';

const info = (symbol, status = 'TRADING') => ({ symbols: [{ symbol, status, baseAsset: symbol.replace(/USDT$/, ''), quoteAsset: 'USDT' }] });

test('el conector pide los precios de todos y los datos de un simbolo', async () => {
  const urls = [];
  const binance = crearBinance({
    fetch: async url => {
      urls.push(url);
      return { ok: true, text: async () => JSON.stringify(url.pathname.endsWith('/exchangeInfo') ? info('SOLUSDT') : []) };
    },
  });
  await binance.precios({ timeout: 0 });
  await binance.infoSimbolo({ symbol: ' SOLUSDT ', timeout: 0 });
  assert.equal(urls[0].pathname, '/api/v3/ticker/price');
  assert.equal(urls[1].pathname, '/api/v3/exchangeInfo');
  assert.equal(urls[1].searchParams.get('symbol'), 'SOLUSDT');
});

test('un simbolo que binance no conoce queda como inexistente', async () => {
  const binance = crearBinance({ fetch: async () => ({ ok: false, status: 400, text: async () => '{"code":-1121,"msg":"Invalid symbol."}' }) });
  await assert.rejects(binance.infoSimbolo({ symbol: 'NOEXISTE', timeout: 0 }), /simbolo inexistente: NOEXISTE/);
  await assert.rejects(binance.infoSimbolo({ symbol: '', timeout: 0 }), /symbol invalido/);
});

test('los precios y el simbolo se normalizan a la forma interna', () => {
  assert.deepEqual(normalizarPrecios([{ symbol: 'BTCUSDT', price: '100.50000000' }]), [{ exchange_id: 'binance', symbol: 'BTCUSDT', price: '100.50000000' }]);
  assert.throws(() => normalizarPrecios([{ symbol: 'BTCUSDT', price: 'x' }]), /price invalido/);
  assert.deepEqual(normalizarSimbolo(info('SOLUSDT')), { exchange_id: 'binance', symbol: 'SOLUSDT', base: 'SOL', quote: 'USDT', operable: true });
  assert.equal(normalizarSimbolo(info('LUNCUSDT', 'BREAK')).operable, false);
  assert.throws(() => normalizarSimbolo({ symbols: [] }), /simbolo invalido/);
});

test('cargarSimbolos deja afuera los que quedaron en cero y validarSimbolo exige que opere', async () => {
  const cargar = crearCargarSimbolos({ conectores: { binance: async () => [{ symbol: 'BTCUSDT', price: '100' }, { symbol: 'BCCBTC', price: '0.00000000' }] } });
  assert.deepEqual((await cargar()).map(s => s.symbol), ['BTCUSDT']);

  const validar = crearValidarSimbolo({ conectores: { binance: async ({ symbol }) => info(symbol, symbol === 'VIEJOUSDT' ? 'BREAK' : 'TRADING') } });
  assert.equal((await validar({ symbol: 'SOLUSDT' })).base, 'SOL');
  await assert.rejects(validar({ symbol: 'VIEJOUSDT' }), /simbolo sin operar: VIEJOUSDT/);
  await assert.rejects(validar({ exchange_id: 'otro', symbol: 'SOLUSDT' }), /exchange no soportado: otro/);
});

test('el buscador ordena exactos, despues los que empiezan y despues los que contienen, con usdt primero', () => {
  const simbolos = ['SOLBTC', 'SOLUSDT', 'SOL', 'ASOLUSDT', 'SOLETH', 'BTCUSDT'].map(symbol => ({ symbol }));
  assert.deepEqual(buscarSimbolos(simbolos, ' sol ').map(s => s.symbol), ['SOL', 'SOLUSDT', 'SOLBTC', 'SOLETH', 'ASOLUSDT']);
  assert.deepEqual(buscarSimbolos(simbolos, ''), [], 'sin texto no hay resultados');
});
