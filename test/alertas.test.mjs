// tests del dominio de alertas de nivel - cruce segun el precio y disparo

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlerta, seguirAlertas } from '../backend/dominio/alertas.mjs';

const CONTEXTO = { exchange_id: 'binance', symbol: 'BTCUSDT', precio: '100', timeframe: '1m', ahora: 1000 };
const vela = (open_time, low, high) => ({ open_time, open: low, high, low, close: high });

test('una alerta arriba del precio cruza hacia arriba y una abajo hacia abajo, con la forma del contrato', () => {
  assert.deepEqual(crearAlerta({ ...CONTEXTO, valor: '110' }), {
    exchange_id: 'binance', symbol: 'BTCUSDT', tipo: 'precio', campo: 'price', operador: 'cruza_arriba', valor: '110',
    timeframe: '1m', activa: 1, disparada: 0, ultimo_disparo: null, disparos: 0, note: null, created_at: 1000, updated_at: 1000,
  });
  assert.equal(crearAlerta({ ...CONTEXTO, valor: '90' }).operador, 'cruza_abajo');
  assert.throws(() => crearAlerta({ ...CONTEXTO, valor: '100' }), /la alerta esta en el precio actual/);
});

test('se dispara una vez con velas posteriores o el precio actual y queda apagada', () => {
  const arriba = crearAlerta({ ...CONTEXTO, valor: '110' });
  const antes = seguirAlertas([arriba], { symbol: 'BTCUSDT', velas: [vela(0, '90', '120')], ahora: 2000 });
  assert.deepEqual(antes, { alertas: [arriba], eventos: [] }, 'la vela de antes de crearla no cuenta');

  const { alertas, eventos } = seguirAlertas([arriba], { symbol: 'BTCUSDT', velas: [vela(2000, '101', '111')], ahora: 3000 });
  assert.deepEqual(
    [alertas[0].activa, alertas[0].disparada, alertas[0].disparos, alertas[0].ultimo_disparo, alertas[0].updated_at],
    [0, 1, 1, 3000, 3000]
  );
  assert.deepEqual(eventos, [{ tipo: 'alerta', alerta: alertas[0] }]);
  assert.deepEqual(seguirAlertas(alertas, { symbol: 'BTCUSDT', velas: [vela(4000, '90', '130')], ahora: 5000 }).eventos, [], 'apagada no se repite');

  const abajo = crearAlerta({ ...CONTEXTO, valor: '90' });
  assert.equal(seguirAlertas([abajo], { symbol: 'BTCUSDT', velas: [], precio: '89', ahora: 2000 }).eventos.length, 1, 'con el precio actual');
  assert.equal(seguirAlertas([abajo], { symbol: 'ETHUSDT', velas: [], precio: '1', ahora: 2000 }).eventos.length, 0, 'solo las del simbolo');
});
