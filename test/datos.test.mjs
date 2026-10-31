import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createData } from '../backend/datos/sqlite/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8');

function conDatos(callback) {
  const datos = createData({ path: ':memory:', ahora: () => 1000 });
  try {
    callback(datos);
  } finally {
    datos.close();
  }
}

function vela(open_time, close = '100') {
  return {
    exchange_id: 'binance',
    symbol: 'BTCUSDT',
    interval: '1m',
    open_time,
    open: '99',
    high: '101',
    low: '98',
    close,
    volume: '10',
    close_time: open_time + 1,
    quote_volume: '1000',
    trades: 5,
    ingested_at: open_time + 2
  };
}

test('catalogo inicial', () => {
  conDatos(datos => {
    assert.deepEqual(datos.catalog.listExchanges().map(exchange => exchange.id), ['binance']);
    assert.deepEqual(datos.catalog.listSymbols().map(symbol => symbol.symbol), ['BTCUSDT', 'ETHUSDT']);
    assert.deepEqual(datos.catalog.listIntervals('binance', 'BTCUSDT'), ['1m', '5m', '1h', '4h', '1d']);
  });
});

test('velas: upsert, rango y limite', () => {
  conDatos(datos => {
    assert.equal(datos.market.saveCandles([vela(1), vela(2), vela(3)]), 3);
    assert.equal(datos.market.saveCandles([vela(2, '120')]), 1);

    const rango = datos.market.readCandles({
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      interval: '1m',
      desde: 2,
      hasta: 4
    });

    assert.deepEqual(rango.map(candle => candle.open_time), [2, 3]);
    assert.equal(rango[0].close, '120');

    const recientes = datos.market.readCandles({
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      interval: '1m',
      limite: 2
    });

    assert.deepEqual(recientes.map(candle => candle.open_time), [2, 3]);
  });
});

test('ticker: guarda y devuelve el mas reciente', () => {
  conDatos(datos => {
    datos.market.saveTicker({
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      timestamp: 10,
      price: '100'
    });
    const guardado = datos.market.saveTicker({
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      timestamp: 11,
      price: '110'
    });

    assert.equal(guardado.open_24h, null);
    assert.equal(datos.market.readLastTicker('binance', 'BTCUSDT').price, '110');
  });
});

test('configuracion', () => {
  conDatos(datos => {
    assert.equal(datos.config.readConfig(), null);
    const guardada = datos.config.saveConfig({
      intervalo_por_defecto: '1m',
      exchange_id: 'binance',
      simbolo_por_defecto: 'BTCUSDT',
      fuente: 'local',
      sondeo_ms: 5000
    });

    assert.equal(guardada.id, 'local');
    assert.equal(guardada.actualizado_en, 1000);
    assert.equal(datos.config.readConfig().simbolo_por_defecto, 'BTCUSDT');
  });
});

test('watchlist: alta, edicion y baja de simbolo', () => {
  conDatos(datos => {
    const lista = datos.watchlist.createWatchlist('Favoritos');
    datos.watchlist.addItem(lista.id, {
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      note: 'seguir'
    });

    assert.equal(datos.watchlist.listItems(lista.id)[0].note, 'seguir');
    const editado = datos.watchlist.editItem(lista.id, 'binance', 'BTCUSDT', { note: null });
    assert.equal(editado.note, null);

    datos.watchlist.removeItem(lista.id, 'binance', 'BTCUSDT');
    assert.deepEqual(datos.watchlist.listItems(lista.id), []);
  });
});

test('alertas: alta, edicion y disparo', () => {
  conDatos(datos => {
    const alerta = datos.alerts.createAlert({
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      tipo: 'precio',
      campo: 'price',
      operador: '>',
      valor: '100',
      timeframe: '1m'
    });

    assert.equal(alerta.activa, 1);
    const editada = datos.alerts.updateAlert(alerta.id, { valor: '120', activa: 0 });
    assert.equal(editada.valor, '120');
    assert.equal(editada.activa, 0);

    const disparada = datos.alerts.markTriggered(alerta.id);
    assert.equal(disparada.disparada, 1);
    assert.equal(disparada.disparos, 1);
    assert.equal(datos.alerts.listAlerts({ activas: 0 }).length, 1);
  });
});

test('operaciones: alta, tags, cierre y cancelacion', () => {
  conDatos(datos => {
    const abierta = datos.operations.registerOperation({
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      lado: 'compra',
      tipo: 'mercado',
      cantidad: '1',
      precio_entrada: '100',
      tags: ['ruptura']
    });

    assert.deepEqual(abierta.tags, ['ruptura']);
    assert.deepEqual(datos.operations.addTag(abierta.id, 'diario'), ['diario', 'ruptura']);
    assert.deepEqual(datos.operations.removeTag(abierta.id, 'diario'), ['ruptura']);

    const cerrada = datos.operations.closeOperation(abierta.id, {
      precio_salida: '110',
      fees: '0.1'
    });
    assert.equal(cerrada.estado, 'cerrada');
    assert.equal(cerrada.precio_salida, '110');
    assert.deepEqual(cerrada.tags, ['ruptura']);

    const paraCancelar = datos.operations.registerOperation({
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      lado: 'venta',
      tipo: 'limite',
      cantidad: '2',
      precio_entrada: '120'
    });
    assert.equal(datos.operations.cancelOperation(paraCancelar.id).estado, 'cancelada');
    assert.equal(datos.operations.listOperations().length, 2);
  });
});

test('notas y busqueda', () => {
  conDatos(datos => {
    const nota = datos.notes.createNote({
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      titulo: 'Zona de soporte',
      cuerpo: 'Revisar el volumen',
      tags: ['analisis']
    });

    assert.deepEqual(nota.tags, ['analisis']);
    assert.equal(datos.notes.listNotes({ busqueda: 'VOLUMEN' }).length, 1);
    assert.equal(datos.notes.listNotes({ busqueda: 'ethereum' }).length, 0);
  });
});

test("el esquema rechaza decimales con punto final", () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(schema);
    db.prepare('INSERT INTO exchange VALUES (?, ?, ?, ?, ?, ?)')
      .run('binance', 'Binance', 'https://api.example', 'wss://api.example', 2, 6000);
    db.prepare('INSERT INTO simbolo VALUES (?, ?, ?, ?)')
      .run('binance', 'BTCUSDT', 'BTC', 'USDT');

    const insertAlert = db.prepare(`
      INSERT INTO alerta (
        exchange_id, symbol, tipo, campo, operador, valor, timeframe,
        activa, disparada, disparos, created_at, updated_at
      ) VALUES (?, ?, 'precio', 'price', '>', ?, '1m', 1, 0, 0, 1, 1)
    `);
    assert.throws(() => insertAlert.run('binance', 'BTCUSDT', '1.'), /CHECK constraint failed/);

    const insertOperation = db.prepare(`
      INSERT INTO operacion (
        exchange_id, symbol, lado, tipo, cantidad, precio_entrada,
        precio_salida, fees, abierta_en, estado
      ) VALUES (?, ?, 'compra', 'mercado', ?, ?, ?, ?, 1, 'abierta')
    `);
    assert.throws(() => insertOperation.run('binance', 'BTCUSDT', '1.', '100', null, '0'), /CHECK constraint failed/);
    assert.throws(() => insertOperation.run('binance', 'BTCUSDT', '1', '1.', null, '0'), /CHECK constraint failed/);
    assert.throws(() => insertOperation.run('binance', 'BTCUSDT', '1', '100', '1.', '0'), /CHECK constraint failed/);
    assert.throws(() => insertOperation.run('binance', 'BTCUSDT', '1', '100', null, '1.'), /CHECK constraint failed/);
  } finally {
    db.close();
  }
});
