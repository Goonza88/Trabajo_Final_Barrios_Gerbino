// tests del estado de la sesion - operaciones de practica, errores de orden, buscador y watchlist

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEstado } from '../frontend/estado/mercado.mjs';
import { errorOrden } from '../frontend/estado/operaciones.mjs';

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

function ticker(symbol, price = '100', open = '90') {
  return {
    exchange_id: 'binance',
    symbol,
    timestamp: 1700000000000,
    price,
    open_24h: open,
    high_24h: '101',
    low_24h: '89',
    volume_24h: '1',
    quote_volume_24h: '100'
  };
}

test('confirmar el borrador crea una operacion con id, lo vacia y anota el evento', () => {
  const { estado, fijarEntrada, fijarNivel, confirmarBorrador } = crearEstado({ cargarVelas: async () => [], ahora: () => 1000 });
  fijarEntrada('mercado', '100');
  fijarNivel('take_profit', '110');
  fijarNivel('stop_loss', '95');
  confirmarBorrador();

  assert.equal(estado.operaciones.length, 1);
  assert.deepEqual(
    [estado.operaciones[0].id, estado.operaciones[0].lado, estado.operaciones[0].estado, estado.operaciones[0].cantidad],
    [1, 'compra', 'abierta', '0.1'],
    '10% de un saldo inicial de 100 a 100'
  );
  assert.deepEqual(estado.borrador, { tipo: null, entrada: null, take_profit: null, stop_loss: null });
  assert.deepEqual(estado.eventos.map(evento => [evento.tipo, evento.en]), [['creada', 1000]]);
});

test('un borrador invalido no crea nada y deja el error hasta descartarlo', () => {
  const { estado, fijarEntrada, confirmarBorrador, descartarBorrador } = crearEstado({ cargarVelas: async () => [] });
  fijarEntrada('mercado', '100');
  confirmarBorrador();
  assert.equal(estado.operaciones.length, 0);
  assert.match(errorOrden(estado), /falta take profit o stop loss/);
  descartarBorrador();
  assert.equal(errorOrden(estado), null);
});

test('cada carga de velas sigue las operaciones del simbolo y los tickers las de los otros', async () => {
  let reloj = 1000;
  let velasNuevas = [];
  const { estado, fijarEntrada, fijarNivel, confirmarBorrador, cargar, cargarTickers } = crearEstado({
    simbolos: ['BTCUSDT', 'ETHUSDT'],
    ahora: () => reloj,
    cargarVelas: async () => velasNuevas,
    cargarTickers: async () => [ticker('BTCUSDT', '100', '100'), ticker('ETHUSDT', '40', '50')],
  });
  fijarEntrada('mercado', '100');
  fijarNivel('take_profit', '110');
  confirmarBorrador();
  estado.symbol = 'ETHUSDT';
  fijarEntrada('mercado', '50');
  fijarNivel('stop_loss', '45');
  confirmarBorrador();
  estado.symbol = 'BTCUSDT';

  reloj = 5000;
  velasNuevas = [{ ...vela(0), open_time: 2000, open: '100', high: '111', low: '99', close: '105' }];
  await cargar();
  assert.deepEqual(estado.operaciones.map(op => [op.symbol, op.estado, op.motivo_cierre]), [['BTCUSDT', 'cerrada', 'tp'], ['ETHUSDT', 'abierta', null]]);

  await cargarTickers();
  assert.deepEqual(estado.operaciones.map(op => [op.symbol, op.estado, op.motivo_cierre]), [['BTCUSDT', 'cerrada', 'tp'], ['ETHUSDT', 'cerrada', 'sl']]);
  assert.deepEqual(estado.eventos.map(evento => evento.tipo), ['creada', 'creada', 'cerrada', 'cerrada']);
});

test('el error de una orden se ve unos segundos y despues se va solo', () => {
  const { estado, fijarEntrada, confirmarBorrador } = crearEstado({ cargarVelas: async () => [], ahora: () => 1000 });
  fijarEntrada('mercado', '100');
  confirmarBorrador();
  assert.match(errorOrden(estado, 1000), /falta take profit/);
  assert.match(errorOrden(estado, 5999), /falta take profit/);
  assert.equal(errorOrden(estado, 6000), null);
});

test('el buscador pide la lista una vez, filtra al escribir y suma el elegido si el exchange lo opera', async () => {
  let pedidos = 0;
  const { estado, abrirBuscador, teclearBuscador } = crearEstado({
    simbolos: ['BTCUSDT'],
    cargarVelas: async () => [],
    cargarTickers: async () => [],
    cargarSimbolos: async () => {
      pedidos++;
      return ['SOLUSDT', 'SOLBTC', 'VIEJOUSDT', 'BTCUSDT'].map(symbol => ({ symbol, price: '1' }));
    },
    validarSimbolo: async ({ symbol }) => {
      if (symbol === 'VIEJOUSDT') throw new Error('simbolo sin operar: VIEJOUSDT');
      return { symbol };
    },
  });
  await abrirBuscador();
  assert.equal(estado.buscador.cargando, false);
  for (const letra of 'sol') teclearBuscador(letra);
  assert.equal(estado.buscador.texto, 'SOL', 'escribe en mayusculas');
  teclearBuscador('ArrowDown');
  assert.equal(estado.buscador.cursor, 1);
  teclearBuscador('ArrowUp');
  await teclearBuscador('Enter');
  assert.equal(estado.buscador, null, 'al sumar se cierra');
  assert.deepEqual(estado.simbolos, ['BTCUSDT', 'SOLUSDT']);
  assert.equal(estado.cursor, 1);

  await abrirBuscador();
  assert.equal(pedidos, 1, 'la lista se pide una sola vez');
  for (const letra of 'viejo') teclearBuscador(letra);
  await teclearBuscador('Enter');
  assert.match(estado.buscador.error, /simbolo sin operar/);
  teclearBuscador('Esc');
  assert.equal(estado.buscador, null);

  await abrirBuscador();
  for (const letra of 'btcusdt') teclearBuscador(letra);
  await teclearBuscador('Enter');
  assert.match(estado.buscador.error, /ya esta en la watchlist: BTCUSDT/);
});

test('quitar deja al menos un simbolo y si era el del grafico pasa al de al lado', async () => {
  const { estado, moverCursor, quitarSimbolo } = crearEstado({
    simbolos: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    cargarVelas: async () => [],
    cargarTickers: async () => [],
  });
  moverCursor(1);
  await quitarSimbolo();
  assert.deepEqual(estado.simbolos, ['BTCUSDT', 'SOLUSDT']);
  assert.equal(estado.symbol, 'BTCUSDT', 'quitar otro no cambia el grafico');

  moverCursor(-1);
  await quitarSimbolo();
  assert.deepEqual(estado.simbolos, ['SOLUSDT']);
  assert.equal(estado.symbol, 'SOLUSDT', 'el grafico pasa al que queda');
  await quitarSimbolo();
  assert.deepEqual(estado.simbolos, ['SOLUSDT'], 'el ultimo no se quita');
});

test('una pendiente de otro simbolo se activa cuando el precio cruza la entrada entre dos consultas', async () => {
  let reloj = 1000;
  let tickers = [ticker('ETHUSDT', '100')];
  const { estado, fijarEntrada, fijarNivel, confirmarBorrador, cargarTickers } = crearEstado({
    simbolos: ['BTCUSDT', 'ETHUSDT'], ahora: () => reloj, cargarVelas: async () => [], cargarTickers: async () => tickers,
  });
  await cargarTickers();
  estado.symbol = 'ETHUSDT';
  estado.velas = [vela(0, '100')];
  fijarEntrada('limite', '95');
  fijarNivel('take_profit', '110');
  confirmarBorrador();
  estado.symbol = 'BTCUSDT';
  reloj = 5000;
  tickers = [ticker('ETHUSDT', '90')];
  await cargarTickers();
  assert.equal(estado.operaciones[0].estado, 'abierta');
});

test('una entrada a mercado se confirma al ultimo precio, no al de cuando se marco', () => {
  const { estado, fijarEntrada, fijarNivel, confirmarBorrador } = crearEstado({ cargarVelas: async () => [] });
  estado.velas = [vela(0, '100')];
  fijarEntrada('mercado', '100');
  fijarNivel('take_profit', '140');
  estado.velas = [vela(1, '130.50000000')];
  confirmarBorrador();
  assert.equal(estado.operaciones[0].precio_entrada, '130.5');
});

test('los simbolos con operaciones o alertas vivas se siguen pidiendo aunque salgan de la watchlist', async () => {
  const pedidos = [];
  const { estado, fijarEntrada, fijarNivel, confirmarBorrador, moverCursor, quitarSimbolo, cargarTickers } = crearEstado({
    simbolos: ['BTCUSDT', 'ETHUSDT'], cargarVelas: async () => [], cargarTickers: async ({ symbols }) => { pedidos.push(symbols); return []; },
  });
  estado.symbol = 'ETHUSDT';
  estado.velas = [vela(0, '100')];
  fijarEntrada('mercado', '100');
  fijarNivel('take_profit', '110');
  confirmarBorrador();
  estado.symbol = 'BTCUSDT';
  moverCursor(1);
  await quitarSimbolo();
  await cargarTickers();
  assert.deepEqual(estado.simbolos, ['BTCUSDT']);
  assert.deepEqual(pedidos.at(-1), ['BTCUSDT', 'ETHUSDT']);
});
