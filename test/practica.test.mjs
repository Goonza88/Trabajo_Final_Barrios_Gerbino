// tests del dominio de operaciones de practica - borrador, activacion y cierres

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelarOperacion, cerrarOperacion, crearOperacion, previsualizarBorrador, seguirOperaciones } from '../backend/dominio/operaciones.mjs';

const CONTEXTO = { exchange_id: 'binance', symbol: 'BTCUSDT', saldo: '1000', porcentaje: '10', ahora: 1000 };
const vela = (open_time, low, high) => ({ open_time, open: low, high, low, close: high });

test('una entrada a mercado abre una compra con la forma de la fila del contrato', () => {
  const operacion = crearOperacion({ tipo: 'mercado', entrada: '100', take_profit: '110', stop_loss: '95' }, CONTEXTO);
  assert.deepEqual(operacion, {
    exchange_id: 'binance', symbol: 'BTCUSDT', lado: 'compra', tipo: 'mercado', cantidad: '1',
    precio_entrada: '100', take_profit: '110', stop_loss: '95', precio_salida: null, fees: '0',
    creada_en: 1000, abierta_en: 1000, cerrada_en: null, motivo_cierre: null, estado: 'abierta', notas: null, tags: [],
  });
});

test('una entrada limite queda pendiente y el lado sale de los niveles', () => {
  const venta = crearOperacion({ tipo: 'limite', entrada: '100', take_profit: '90', stop_loss: '105' }, CONTEXTO);
  assert.equal(venta.lado, 'venta');
  assert.equal(venta.estado, 'pendiente');
  assert.equal(venta.abierta_en, null);
  assert.equal(crearOperacion({ tipo: 'limite', entrada: '100', stop_loss: '95' }, CONTEXTO).lado, 'compra', 'sin tp decide el sl');
  assert.equal(crearOperacion({ tipo: 'limite', entrada: '100', stop_loss: '105' }, CONTEXTO).lado, 'venta');
});

test('el borrador se valida antes de crear la operacion', () => {
  const crear = (borrador, contexto = {}) => () => crearOperacion(borrador, { ...CONTEXTO, ...contexto });
  assert.throws(crear({ tipo: null, entrada: null, take_profit: '110' }), /falta la entrada/);
  assert.throws(crear({ tipo: 'mercado', entrada: '100' }), /falta take profit o stop loss/);
  assert.throws(crear({ tipo: 'mercado', entrada: '100', take_profit: '110', stop_loss: '105' }), /stop loss del lado equivocado para compra/);
  assert.throws(crear({ tipo: 'mercado', entrada: '100', take_profit: '90', stop_loss: '95' }), /stop loss del lado equivocado para venta/);
  assert.throws(crear({ tipo: 'mercado', entrada: '100', take_profit: '110' }, { saldo: '-5' }), /sin saldo/);
  assert.throws(crear({ tipo: 'mercado', entrada: '100', take_profit: '110' }, { porcentaje: '150' }), /porcentaje invalido: 150/);
  assert.throws(crear({ tipo: 'mercado', entrada: '100000', take_profit: '110000' }, { saldo: '0.00000001', porcentaje: '1' }), /cantidad nula/);
  assert.throws(crear({ tipo: 'mercado', entrada: '1,5', take_profit: '2' }), /decimal invalido/);
});

test('una abierta cierra por tp con velas posteriores y no con las de antes', () => {
  const abierta = crearOperacion({ tipo: 'mercado', entrada: '100', take_profit: '110', stop_loss: '95' }, CONTEXTO);
  const sinCambio = seguirOperaciones([abierta], { symbol: 'BTCUSDT', velas: [vela(0, '90', '120')], ahora: 2000 });
  assert.deepEqual(sinCambio, { operaciones: [abierta], eventos: [] }, 'la vela de antes de abrir no cuenta');

  const { operaciones, eventos } = seguirOperaciones([abierta], { symbol: 'BTCUSDT', velas: [vela(0, '90', '120'), vela(2000, '101', '111')], ahora: 3000 });
  assert.equal(operaciones[0].estado, 'cerrada');
  assert.equal(operaciones[0].precio_salida, '110');
  assert.equal(operaciones[0].motivo_cierre, 'tp');
  assert.equal(operaciones[0].cerrada_en, 3000);
  assert.deepEqual(eventos, [{ tipo: 'cerrada', operacion: operaciones[0] }]);
});

test('el precio actual cuenta aunque la vela haya empezado antes', () => {
  const abierta = crearOperacion({ tipo: 'mercado', entrada: '100', take_profit: '110', stop_loss: '95' }, CONTEXTO);
  const { operaciones } = seguirOperaciones([abierta], { symbol: 'BTCUSDT', velas: [vela(0, '99', '101')], precio: '94', ahora: 2000 });
  assert.equal(operaciones[0].motivo_cierre, 'sl');
  assert.equal(operaciones[0].precio_salida, '95');
});

test('una pendiente se activa y puede cerrar en la misma consulta con las velas siguientes', () => {
  const pendiente = crearOperacion({ tipo: 'limite', entrada: '100', take_profit: '110', stop_loss: '95' }, CONTEXTO);
  const { operaciones, eventos } = seguirOperaciones([pendiente], {
    symbol: 'BTCUSDT', velas: [vela(2000, '99', '104'), vela(3000, '103', '111')], ahora: 4000,
  });
  assert.deepEqual(eventos.map(evento => evento.tipo), ['activada', 'cerrada']);
  assert.equal(eventos[0].operacion.abierta_en, 4000);
  assert.equal(operaciones[0].motivo_cierre, 'tp');
});

test('solo sigue las del simbolo y deja quietas las cerradas', () => {
  const otra = { ...crearOperacion({ tipo: 'mercado', entrada: '100', take_profit: '110' }, CONTEXTO), symbol: 'ETHUSDT' };
  const cerrada = cerrarOperacion(crearOperacion({ tipo: 'mercado', entrada: '100', take_profit: '110' }, CONTEXTO), '105', 1500);
  const { operaciones, eventos } = seguirOperaciones([otra, cerrada], { symbol: 'BTCUSDT', velas: [vela(2000, '90', '200')], ahora: 3000 });
  assert.deepEqual(operaciones, [otra, cerrada]);
  assert.deepEqual(eventos, []);
});

test('cierre manual y cancelacion solo sobre lo que sigue vivo', () => {
  const abierta = crearOperacion({ tipo: 'mercado', entrada: '100', take_profit: '110' }, CONTEXTO);
  const cerrada = cerrarOperacion(abierta, '105', 2000);
  assert.deepEqual([cerrada.estado, cerrada.precio_salida, cerrada.motivo_cierre, cerrada.cerrada_en], ['cerrada', '105', 'manual', 2000]);
  assert.throws(() => cerrarOperacion(cerrada, '106', 3000), /la operacion no esta abierta: cerrada/);

  const pendiente = crearOperacion({ tipo: 'limite', entrada: '100', take_profit: '110' }, CONTEXTO);
  assert.throws(() => cerrarOperacion(pendiente, '100', 2000), /la operacion no esta abierta: pendiente/);
  const cancelada = cancelarOperacion(pendiente, 2000);
  assert.deepEqual([cancelada.estado, cancelada.precio_salida, cancelada.motivo_cierre, cancelada.cerrada_en], ['cancelada', null, null, 2000]);
  assert.throws(() => cancelarOperacion(cancelada, 3000), /la operacion no esta abierta: cancelada/);
});

test('la vista previa del borrador muestra lado, cantidad y resultado en tp y sl, o el error', () => {
  const previa = previsualizarBorrador({ tipo: 'limite', entrada: '100', take_profit: '110', stop_loss: '95' }, { saldo: '1000', porcentaje: '10' });
  assert.deepEqual(previa, { lado: 'compra', cantidad: '1', en_tp: '10', en_sl: '-5', ratio: 2, error: null });
  assert.deepEqual(previsualizarBorrador({ tipo: null, entrada: null, take_profit: '110', stop_loss: null }, { saldo: '1000', porcentaje: '10' }),
    { lado: null, cantidad: null, en_tp: null, en_sl: null, ratio: null, error: 'falta la entrada' });
});
