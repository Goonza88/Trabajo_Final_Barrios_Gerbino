import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, formatear, sumar, restar, comparar, multiplicar, dividir, ESCALA, DECIMALES } from '../backend/metricas/decimal.mjs';

test('parse entero', () => {
  assert.equal(parse('1'), 100000000n);
  assert.equal(parse('0'), 0n);
});

test('parse decimal', () => {
  assert.equal(parse('0.00000001'), 1n);
  assert.equal(parse('123.456'), 12345600000n);
});

test('formatear sin ceros trailing', () => {
  assert.equal(formatear(100000000n), '1');
  assert.equal(formatear(0n), '0');
  assert.equal(formatear(1n), '0.00000001');
  assert.equal(formatear(12345600000n), '123.456');
});

test('roundtrip', () => {
  const vals = ['1', '0', '0.00000001', '123.456', '83988.00000000'];
  for (const v of vals) {
    const p = parse(v);
    const f = formatear(p);
    assert.equal(formatear(parse(f)), f);
  }
});

test('sumar restar comparar', () => {
  assert.equal(formatear(sumar('1', '2')), '3');
  assert.equal(formatear(restar('3', '1')), '2');
  assert.equal(comparar('1', '2'), -1);
  assert.equal(comparar('2', '1'), 1);
  assert.equal(comparar('5', '5'), 0);
});

test('la escala sale de los decimales', () => {
  assert.equal(ESCALA, 10n ** BigInt(DECIMALES));
  assert.equal(parse('1.' + '0'.repeat(DECIMALES - 1) + '1'), ESCALA + 1n);
});

test('multiplicar exacto y truncado', () => {
  assert.equal(formatear(multiplicar('2.5', '4')), '10');
  assert.equal(formatear(multiplicar('0.001', '83988.12')), '83.98812');
  assert.equal(formatear(multiplicar('0.00000001', '0.5')), '0');
});

test('dividir exacto y truncado', () => {
  assert.equal(formatear(dividir('10', '4')), '2.5');
  assert.equal(formatear(dividir('1', '3')), '0.33333333');
  assert.equal(formatear(dividir('2', '3')), '0.66666666');
});

test('dividir por cero tira', () => {
  assert.throws(() => dividir('1', '0'), /division por cero/);
  assert.throws(() => dividir('1', '0.00000000'), /division por cero/);
});

test('errores', () => {
  assert.throws(() => parse('1e-8'));
  assert.throws(() => parse('-1'));
  assert.throws(() => parse('1,2'));
  assert.throws(() => parse('1.234567891'));
  assert.throws(() => parse('abc'));
});