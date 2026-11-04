// tests de metricas de operaciones y cruces de niveles

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cantidadPorPorcentaje, metricasOperaciones, pnlOperacion, resumenCartera } from '../backend/metricas/operaciones.mjs';
import { activacionPendiente, cierrePorNivel, disparoAlerta } from '../backend/metricas/niveles.mjs';

const operacion = campos => ({ symbol: 'BTCUSDT', fees: '0', precio_salida: null, ...campos });

// +19, -5.5 y +2 cerradas, una abierta, una pendiente y una cancelada
const OPERACIONES = [
  operacion({ estado: 'cerrada', lado: 'compra', cantidad: '2', precio_entrada: '100', precio_salida: '110', fees: '1' }),
  operacion({ estado: 'cerrada', lado: 'venta', cantidad: '1', precio_entrada: '50', precio_salida: '55', fees: '0.5' }),
  operacion({ estado: 'cerrada', lado: 'compra', cantidad: '4', precio_entrada: '10', precio_salida: '10.5' }),
  operacion({ estado: 'abierta', lado: 'compra', cantidad: '0.5', precio_entrada: '200', fees: '0.1' }),
  operacion({ estado: 'pendiente', lado: 'compra', cantidad: '1', precio_entrada: '90' }),
  operacion({ estado: 'cancelada', lado: 'venta', cantidad: '1', precio_entrada: '300' }),
];

const vela = (low, high, open_time = 0) => ({ open_time, open: low, high, low, close: high });

test('pnl de cerradas por lado y flotante de abiertas al precio actual', () => {
  assert.deepEqual(OPERACIONES.slice(0, 3).map(op => pnlOperacion(op)), ['19', '-5.5', '2']);
  assert.equal(pnlOperacion(OPERACIONES[3], '210'), '4.9');
  assert.equal(pnlOperacion(OPERACIONES[3]), null, 'una abierta sin precio no tiene pnl');
  assert.equal(pnlOperacion(OPERACIONES[4], '100'), null);
  assert.equal(pnlOperacion(OPERACIONES[5], '100'), null);
});

test('las metricas solo cuentan cerradas', () => {
  const metricas = metricasOperaciones(OPERACIONES);
  assert.equal(metricas.cerradas, 3);
  assert.equal(metricas.ganadoras, 2);
  assert.equal(metricas.perdedoras, 1);
  assert.equal(metricas.pnl_total, '15.5');
  assert.equal(metricas.valor_esperado, '5.16666666', 'el promedio trunca como el resto de las cuentas');
  assert.ok(Math.abs(metricas.win_rate - 200 / 3) < 1e-9);
  assert.ok(Math.abs(metricas.profit_factor - 21 / 5.5) < 1e-9);
});

test('sin cerradas o sin perdidas las proporciones quedan en null', () => {
  assert.deepEqual(metricasOperaciones([]), {
    cerradas: 0, ganadoras: 0, perdedoras: 0, pnl_total: '0', win_rate: null, profit_factor: null, valor_esperado: null,
  });
  assert.equal(metricasOperaciones([OPERACIONES[0]]).profit_factor, null);
});

test('la cartera suma lo realizado al saldo y el flotante al patrimonio', () => {
  assert.deepEqual(resumenCartera('100', OPERACIONES, { BTCUSDT: '210' }), { saldo: '115.5', flotante: '4.9', patrimonio: '120.4' });
  assert.deepEqual(resumenCartera('100', OPERACIONES), { saldo: '115.5', flotante: '0', patrimonio: '115.5' }, 'sin precio no hay flotante');
});

test('la cantidad sale de un porcentaje del saldo al precio de entrada', () => {
  assert.equal(cantidadPorPorcentaje('100', '10', '4'), '2.5');
  assert.equal(cantidadPorPorcentaje('100', '10', '3'), '3.33333333', 'trunca a la escala');
});

test('un lado desconocido tira', () => {
  assert.throws(() => pnlOperacion(operacion({ estado: 'cerrada', lado: 'largo', cantidad: '1', precio_entrada: '1', precio_salida: '2' })), /lado invalido: largo/);
});

test('una pendiente se activa en la primera vela que toca su entrada', () => {
  const pendiente = { precio_entrada: '95' };
  assert.equal(activacionPendiente(pendiente, [vela('96', '99', 1), vela('94', '97', 2), vela('90', '96', 3)])?.open_time, 2);
  assert.equal(activacionPendiente(pendiente, [vela('96', '99')]), null);
});

test('una compra cierra en tp con el maximo y en sl con el minimo, al precio del nivel', () => {
  const compra = { lado: 'compra', take_profit: '110', stop_loss: '90' };
  assert.deepEqual(cierrePorNivel(compra, [vela('95', '105', 1), vela('98', '111', 2)]), { motivo_cierre: 'tp', precio_salida: '110', vela: vela('98', '111', 2) });
  assert.equal(cierrePorNivel(compra, [vela('89', '100', 1)]).motivo_cierre, 'sl');
  assert.equal(cierrePorNivel(compra, [vela('95', '105')]), null);
});

test('una venta cierra en tp con el minimo y en sl con el maximo', () => {
  const venta = { lado: 'venta', take_profit: '90', stop_loss: '110' };
  assert.equal(cierrePorNivel(venta, [vela('89', '100')]).motivo_cierre, 'tp');
  assert.equal(cierrePorNivel(venta, [vela('95', '111')]).motivo_cierre, 'sl');
});

test('si una vela toca tp y sl gana el sl, y sin un nivel solo cuenta el otro', () => {
  assert.equal(cierrePorNivel({ lado: 'compra', take_profit: '110', stop_loss: '90' }, [vela('89', '112')]).motivo_cierre, 'sl');
  assert.equal(cierrePorNivel({ lado: 'compra', take_profit: '110', stop_loss: null }, [vela('80', '112')]).motivo_cierre, 'tp');
});

test('una alerta de nivel se dispara al cruzarlo hacia su lado', () => {
  const velas = [vela('96', '104', 1), vela('95', '105', 2)];
  assert.equal(disparoAlerta({ operador: 'cruza_arriba', valor: '105' }, velas)?.open_time, 2);
  assert.equal(disparoAlerta({ operador: 'cruza_abajo', valor: '95' }, velas)?.open_time, 2);
  assert.equal(disparoAlerta({ operador: 'cruza_arriba', valor: '106' }, velas), null);
  assert.throws(() => disparoAlerta({ operador: '>', valor: '1' }, velas), /operador no soportado: >/);
});
