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

test('si la watchlist no tiene simbolos validos usa el symbol', () => {
  const { estado } = crearEstado({ symbol: 'BTCUSDT', simbolos: ['', 1] });
  assert.deepEqual(estado.simbolos, ['BTCUSDT']);
  assert.equal(estado.symbol, 'BTCUSDT');
  assert.equal(estado.cursor, 0);
});

test('cargarTickers guarda solo los simbolos de la lista', async () => {
  const llamadas = [];
  const fake = opciones => {
    llamadas.push(opciones);
    return Promise.resolve([
      ticker('ETHUSDT', '200', '190'),
      ticker('BTCUSDT', '100', '90'),
      ticker('XRPUSDT', '1', '0.9')
    ]);
  };
  const { estado, cargarTickers } = crearEstado({
    simbolos: ['BTCUSDT', 'ETHUSDT'],
    cargarTickers: fake
  });

  await cargarTickers();

  assert.deepEqual(llamadas[0].symbols, ['BTCUSDT', 'ETHUSDT']);
  assert.deepEqual(Object.keys(estado.tickers).sort(), ['BTCUSDT', 'ETHUSDT']);
  assert.equal(estado.tickers.BTCUSDT.price, '100');
  assert.equal(estado.tickers.ETHUSDT.price, '200');
  assert.equal(estado.tickers_error, null);
  assert.ok(estado.tickers_actualizado_en);
});

test('una carga vieja de tickers no pisa a la nueva', async () => {
  const pendientes = [];
  const llamadas = [];
  const fake = opciones => {
    const d = deferred();
    llamadas.push(opciones);
    pendientes.push(d);
    return d.promise;
  };
  const { estado, cargarTickers } = crearEstado({
    simbolos: ['BTCUSDT'],
    cargarTickers: fake
  });

  const primera = cargarTickers();
  const segunda = cargarTickers();
  assert.equal(pendientes.length, 2);
  assert.equal(llamadas[0].signal.aborted, true);

  pendientes[1].resolve([ticker('BTCUSDT', '200', '190')]);
  await segunda;
  pendientes[0].resolve([ticker('BTCUSDT', '100', '90')]);
  await primera;

  assert.equal(estado.tickers.BTCUSDT.price, '200');
  assert.equal(estado.tickers_error, null);
});

test('un error de tickers conserva el ultimo precio', async () => {
  let llamadas = 0;
  const fake = () => {
    llamadas++;
    if (llamadas === 2) return Promise.reject(new Error('sin red'));
    return Promise.resolve([ticker('BTCUSDT', '100', '90')]);
  };
  const { estado, cargarTickers } = crearEstado({
    simbolos: ['BTCUSDT'],
    cargarTickers: fake
  });

  await cargarTickers();
  await cargarTickers();

  assert.equal(estado.tickers.BTCUSDT.price, '100');
  assert.equal(estado.tickers_error, 'sin red');
});

test('seleccionar cancela la carga anterior y cambia el simbolo', async () => {
  const pendientes = [];
  const llamadas = [];
  const fake = opciones => {
    const d = deferred();
    llamadas.push(opciones);
    pendientes.push(d);
    return d.promise;
  };
  const { estado, cargar, seleccionar } = crearEstado({
    simbolos: ['BTCUSDT', 'ETHUSDT'],
    cargarVelas: fake
  });

  const primera = cargar();
  const segunda = seleccionar('ETHUSDT');
  assert.equal(estado.symbol, 'ETHUSDT');
  assert.equal(estado.cursor, 1);
  assert.equal(llamadas[0].signal.aborted, true);

  pendientes[1].resolve([vela(1, '200')]);
  await segunda;
  pendientes[0].resolve([vela(0, '100')]);
  await primera;

  assert.equal(estado.velas.length, 1);
  assert.equal(estado.velas[0].close, '200');
  assert.equal(estado.ultimo, '200');
});

test('moverCursor y seleccionarCursor eligen dentro de la watchlist', async () => {
  const llamadas = [];
  const fake = opciones => {
    llamadas.push(opciones);
    return Promise.resolve([]);
  };
  const {
    estado,
    moverCursor,
    seleccionar,
    seleccionarCursor,
    alternarFoco,
    setFoco
  } = crearEstado({
    simbolos: ['BTCUSDT', 'ETHUSDT'],
    cargarVelas: fake,
    cargarTickers: async () => []
  });

  assert.equal(estado.cursor, 0);
  moverCursor(1);
  assert.equal(estado.cursor, 1);
  moverCursor(1);
  assert.equal(estado.cursor, 1);
  moverCursor(-2);
  assert.equal(estado.cursor, 0);

  moverCursor(1);
  await seleccionarCursor();
  assert.equal(estado.symbol, 'ETHUSDT');
  assert.equal(estado.cursor, 1);
  assert.equal(llamadas.at(-1).symbol, 'ETHUSDT');

  await seleccionar('XRPUSDT');
  assert.equal(estado.symbol, 'ETHUSDT');

  assert.equal(estado.foco, 'grafico');
  alternarFoco();
  assert.equal(estado.foco, 'watchlist');
  setFoco('grafico');
  assert.equal(estado.foco, 'grafico');
  setFoco('otro');
  assert.equal(estado.foco, 'grafico');
});

test('pan usa la cantidad realmente visible y vuelve a fijar al moverse', () => {
  const { estado, mover, zoomH } = crearEstado({ cargarVelas: async () => [] });
  estado.velas = Array.from({ length: 100 }, (_, i) => vela(i));
  estado.zoomX = 80;

  mover('h', 40);
  assert.equal(estado.offset, 1);
  for (let i = 0; i < 59; i++) mover('h', 40);
  assert.equal(estado.offset, 60);
  mover('h', 40);
  assert.equal(estado.offset, 60, 'no desplaza mas que la primera vela');

  mover('l', 80);
  assert.equal(estado.offset, 19, 'al ampliar la vista, parte del offset previo no es valido');

  zoomH('+', 40);
  assert.equal(estado.zoomX, 35, 'el zoom responde desde el maximo que cabe');
  zoomH('-', 40);
  assert.equal(estado.zoomX, 40);
  zoomH('-', 40);
  assert.equal(estado.zoomX, 40, 'no intenta mostrar mas velas que las columnas disponibles');
});

test('cancelar descarta tambien la respuesta de tickers', async () => {
  const pendiente = deferred();
  const { estado, cargarTickers, cancelar } = crearEstado({
    cargarTickers: () => pendiente.promise
  });

  const carga = cargarTickers();
  cancelar();
  pendiente.resolve([ticker('BTCUSDT', '100', '90')]);
  await carga;

  assert.deepEqual(estado.tickers, {});
  assert.equal(estado.tickers_error, null);
});
