// tests del normalizador - las velas de binance al contrato de datos

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarKlines } from '../backend/red/normalizar.mjs';

const fila = [0, '100.0', '101.0', '99.0', '100.5', '1.2', 59999, '120.0', 3];

test('normaliza una vela completa', () => {
  const [vela] = normalizarKlines([fila], { symbol: 'BTCUSDT', interval: '1m' });
  assert.equal(vela.exchange_id, 'binance');
  assert.equal(vela.symbol, 'BTCUSDT');
  assert.equal(vela.interval, '1m');
  assert.equal(vela.open_time, 0);
  assert.equal(vela.close_time, 59999);
  assert.equal(vela.open, '100.0');
  assert.equal(vela.close, '100.5');
  assert.equal(vela.trades, 3);
});

test('los numeros se convierten a decimal simple', () => {
  const [vela] = normalizarKlines([[0, 0.00000001, 1, 1, 1, 1, 1, 1, 0]]);
  assert.equal(vela.open, '0.00000001');
});

test('sin trades queda null', () => {
  const [vela] = normalizarKlines([[0, '1', '1', '1', '1', '1', 1, '1']]);
  assert.equal(vela.trades, null);
});

test('rechaza decimales fuera del contrato', () => {
  assert.throws(() => normalizarKlines([[0, 1e-9, 1, 1, 1, 1, 1, 1, 0]]), /open invalido/);
  assert.throws(() => normalizarKlines([[0, '1e-8', 1, 1, 1, 1, 1, 1, 0]]), /open invalido/);
  assert.throws(() => normalizarKlines([[0, '1.123456789', 1, 1, 1, 1, 1, 1, 0]]), /open invalido/);
});

test('rechaza vela o timestamp invalido', () => {
  assert.throws(() => normalizarKlines(['no']), /vela invalida/);
  assert.throws(() => normalizarKlines([[null, '1', '1', '1', '1', '1', 1, '1', 0]]), /open_time invalido/);
  assert.throws(() => normalizarKlines([[0.5, '1', '1', '1', '1', '1', 1, '1', 0]]), /open_time invalido/);
  assert.throws(() => normalizarKlines([[0, '1', '1', '1', '1', '1', 1, '1', -1]]), /trades invalido/);
});
