import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createData } from '../backend/datos/sqlite/index.mjs';
import { up as applyInitialMigration } from '../backend/datos/migraciones/001-inicial.mjs';

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
      saldo_inicial: '10000',
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
      operador: 'cruza_arriba',
      valor: '100',
      timeframe: '1m'
    });

    assert.equal(alerta.activa, 1);
    const disparada = datos.alerts.markTriggered(alerta.id);
    assert.equal(disparada.disparada, 1);
    assert.equal(disparada.disparos, 1);

    const editada = datos.alerts.updateAlert(alerta.id, { activa: 0 });
    assert.equal(editada.activa, 0);
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
      motivo_cierre: 'manual',
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
    assert.deepEqual(datos.operations.listOperations()[0].tags, ['ruptura']);
  });
});

test('las notas de una operacion se editan en cualquier estado', () => {
  conDatos(datos => {
    const operacion = datos.operations.registerOperation({
      exchange_id: 'binance', symbol: 'BTCUSDT', lado: 'compra', tipo: 'mercado', cantidad: '1', precio_entrada: '100'
    });
    assert.equal(datos.operations.editOperation(operacion.id, { notas: '# idea\nruptura' }).notas, '# idea\nruptura');
    datos.operations.closeOperation(operacion.id, { precio_salida: '110', motivo_cierre: 'manual' });
    const cerrada = datos.operations.editOperation(operacion.id, { notas: 'salio bien' });
    assert.equal(cerrada.notas, 'salio bien');
    assert.equal(cerrada.estado, 'cerrada');
    assert.equal(datos.operations.editOperation(operacion.id, { notas: null }).notas, null);
    assert.throws(() => datos.operations.editOperation(operacion.id, { notas: '  ' }), /texto invalido en notas/);
    assert.throws(() => datos.operations.editOperation(operacion.id, { estado: 'abierta' }), /campo desconocido: estado/);
    assert.throws(() => datos.operations.editOperation(999, { notas: 'x' }), /operacion inexistente: 999/);
  });
});

test('operaciones de practica: pendiente, activacion y motivos de cierre', () => {
  let instante = 1000;
  const datos = createData({ path: ':memory:', ahora: () => instante });

  function operacion(cambios = {}) {
    return datos.operations.registerOperation({
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      lado: 'compra',
      tipo: 'limite',
      cantidad: '1',
      precio_entrada: '100',
      ...cambios
    });
  }

  try {
    const pendiente = operacion({
      estado: 'pendiente',
      take_profit: '120',
      stop_loss: '90',
      tags: ['practica']
    });
    assert.equal(pendiente.estado, 'pendiente');
    assert.equal(pendiente.creada_en, 1000);
    assert.equal(pendiente.abierta_en, null);
    assert.equal(pendiente.take_profit, '120');
    assert.equal(pendiente.stop_loss, '90');

    instante = 2000;
    const abierta = datos.operations.activateOperation(pendiente.id);
    assert.equal(abierta.estado, 'abierta');
    assert.equal(abierta.abierta_en, 2000);
    assert.deepEqual(abierta.tags, ['practica']);
    assert.throws(
      () => datos.operations.activateOperation(abierta.id),
      { message: 'la operacion no esta pendiente: abierta' }
    );

    assert.throws(
      () => datos.operations.closeOperation(abierta.id, { precio_salida: '120' }),
      { message: 'parametro requerido: motivo_cierre' }
    );
    instante = 3000;
    const cerrada = datos.operations.closeOperation(abierta.id, {
      precio_salida: '120',
      motivo_cierre: 'tp'
    });
    assert.equal(cerrada.estado, 'cerrada');
    assert.equal(cerrada.motivo_cierre, 'tp');

    for (const motivo_cierre of ['sl', 'manual']) {
      const abiertaDirecta = operacion({ tipo: 'mercado' });
      const cerradaDirecta = datos.operations.closeOperation(abiertaDirecta.id, {
        precio_salida: '90',
        motivo_cierre
      });
      assert.equal(cerradaDirecta.motivo_cierre, motivo_cierre);
    }

    const paraCancelar = operacion({ estado: 'pendiente' });
    const cancelada = datos.operations.cancelOperation(paraCancelar.id);
    assert.equal(cancelada.estado, 'cancelada');
    assert.equal(cancelada.abierta_en, null);
    assert.equal(cancelada.motivo_cierre, null);
  } finally {
    datos.close();
  }
});

test('operaciones de practica: valida niveles y saldo inicial', () => {
  conDatos(datos => {
    const operacion = {
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      lado: 'compra',
      tipo: 'limite',
      cantidad: '1',
      precio_entrada: '100'
    };

    assert.throws(
      () => datos.operations.registerOperation({ ...operacion, take_profit: '1.' }),
      /decimal invalido en take_profit: 1\./
    );
    assert.throws(
      () => datos.operations.registerOperation({ ...operacion, stop_loss: '1.' }),
      /decimal invalido en stop_loss: 1\./
    );
    assert.throws(
      () => datos.config.saveConfig({
        intervalo_por_defecto: '1m',
        saldo_inicial: '1.',
        fuente: 'local',
        sondeo_ms: 5000
      }),
      /decimal invalido en saldo_inicial: 1\./
    );
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
    assert.deepEqual(datos.notes.listNotes({ busqueda: 'VOLUMEN' })[0].tags, ['analisis']);
    assert.equal(datos.notes.listNotes({ busqueda: 'ethereum' }).length, 0);

    datos.notes.createNote({ titulo: 'Año de ESPAÑA', cuerpo: 'Señal de COMPRA' });
    assert.equal(datos.notes.listNotes({ busqueda: 'AÑO' }).length, 1);
    assert.equal(datos.notes.listNotes({ busqueda: 'españa' }).length, 1);
    assert.equal(datos.notes.listNotes({ busqueda: 'SEÑAL' }).length, 1);
  });
});

test('errores definidos en el contrato', () => {
  conDatos(datos => {
    function error(metodo, mensaje) {
      assert.throws(metodo, resultado => resultado.message === mensaje);
    }

    error(
      () => datos.operations.registerOperation({
        exchange_id: 'binance',
        symbol: 'BTCUSDT',
        lado: 'compra',
        tipo: 'mercado',
        cantidad: '1.',
        precio_entrada: '100'
      }),
      'decimal invalido en cantidad: 1.'
    );
    error(() => datos.operations.getOperation(0), 'entero invalido en operacion_id: 0');
    error(() => datos.catalog.registerExchange(null), 'se espera un objeto');
    error(() => datos.notes.listNotes({ buscar: 'x' }), 'campo desconocido: buscar');
    error(() => datos.market.saveCandles(null), 'se espera una lista de velas');
    error(() => datos.notes.createNote({ cuerpo: 'texto' }), 'parametro requerido: titulo');
    error(() => datos.notes.createNote({ titulo: '', cuerpo: 'texto' }), 'texto invalido en titulo: ');
    error(
      () => datos.market.saveCandles([{ exchange_id: 'binance', symbol: 'BTCUSDT' }]),
      'parametro requerido: interval'
    );

    error(
      () => datos.catalog.registerExchange({
        id: 'binance',
        nombre: 'Binance',
        base_url: 'https://api.example',
        ws_url: 'wss://api.example',
        peso_por_consulta: 2,
        limite_por_minuto: 6000
      }),
      'exchange ya registrado: binance'
    );
    error(
      () => datos.catalog.registerSymbol({
        exchange_id: 'binance',
        symbol: 'BTCUSDT',
        base: 'BTC',
        quote: 'USDT'
      }),
      'simbolo ya registrado: binance/BTCUSDT'
    );
    error(
      () => datos.catalog.registerSymbol({
        exchange_id: 'otro',
        symbol: 'BTCUSDT',
        base: 'BTC',
        quote: 'USDT'
      }),
      'exchange inexistente: otro'
    );
    error(
      () => datos.market.saveTicker({
        exchange_id: 'binance',
        symbol: 'NOEXISTE',
        timestamp: 1,
        price: '100'
      }),
      'simbolo inexistente: binance/NOEXISTE'
    );

    datos.catalog.registerSymbol({
      exchange_id: 'binance',
      symbol: 'XRPUSDT',
      base: 'XRP',
      quote: 'USDT'
    });
    error(
      () => datos.market.saveCandles([{ ...vela(1), symbol: 'XRPUSDT' }]),
      'intervalo no habilitado: binance/XRPUSDT/1m'
    );
    error(
      () => datos.config.saveConfig({
        intervalo_por_defecto: '1m',
        saldo_inicial: '10000',
        exchange_id: 'binance',
        simbolo_por_defecto: 'XRPUSDT',
        fuente: 'local',
        sondeo_ms: 5000
      }),
      'el intervalo 1m no esta habilitado para binance/XRPUSDT'
    );

    error(
      () => datos.config.saveConfig({
        intervalo_por_defecto: '1m',
        saldo_inicial: '10000',
        exchange_id: 'binance',
        fuente: 'local',
        sondeo_ms: 5000
      }),
      'exchange_id y simbolo_por_defecto van juntos'
    );
    error(
      () => datos.config.saveConfig({
        intervalo_por_defecto: '1m',
        saldo_inicial: '10000',
        fuente: 'remoto',
        sondeo_ms: 5000
      }),
      'fuente remoto necesita fuente_url'
    );
    error(
      () => datos.config.saveConfig({
        intervalo_por_defecto: '1m',
        saldo_inicial: '10000',
        fuente: 'local',
        fuente_url: 'https://api.example',
        sondeo_ms: 5000
      }),
      'fuente_url solo va en remoto'
    );
    error(
      () => datos.config.saveConfig({
        intervalo_por_defecto: '1m',
        saldo_inicial: '10000',
        exchange_id: 'binance',
        simbolo_por_defecto: '',
        fuente: 'local',
        sondeo_ms: 5000
      }),
      'texto invalido en simbolo_por_defecto: '
    );

    error(
      () => datos.alerts.createAlert({
        exchange_id: 'binance',
        symbol: 'BTCUSDT',
        tipo: 'precio',
        campo: 'change24h',
        operador: '>',
        valor: '100',
        timeframe: '1m'
      }),
      'campo change24h no corresponde al tipo precio (se espera price)'
    );
    error(
      () => datos.alerts.createAlert({
        exchange_id: 'binance',
        symbol: 'BTCUSDT',
        tipo: 'precio',
        campo: 'price',
        operador: '!=',
        valor: '100',
        timeframe: '1m',
        activa: 2
      }),
      'operador invalido: != (se espera uno de >, >=, <, <=, ==, cruza_arriba, cruza_abajo)'
    );
    error(
      () => datos.alerts.createAlert({
        exchange_id: 'binance',
        symbol: 'BTCUSDT',
        tipo: 'precio',
        campo: 'price',
        operador: '>',
        valor: '100',
        timeframe: '1m',
        activa: 2
      }),
      'booleano invalido en activa: 2'
    );

    const lista = datos.watchlist.createWatchlist('Favoritos');
    const item = { exchange_id: 'binance', symbol: 'BTCUSDT' };
    datos.watchlist.addItem(lista.id, item);
    error(
      () => datos.watchlist.addItem(lista.id, item),
      'el simbolo ya esta en la watchlist: binance/BTCUSDT'
    );
    error(
      () => datos.watchlist.removeItem(lista.id, 'binance', 'ETHUSDT'),
      'el simbolo no esta en la watchlist: binance/ETHUSDT'
    );
    error(() => datos.watchlist.deleteWatchlist(999), 'watchlist inexistente: 999');
    error(() => datos.alerts.deleteAlert(999), 'alerta inexistente: 999');
    error(() => datos.operations.cancelOperation(999), 'operacion inexistente: 999');
    error(() => datos.notes.deleteNote(999), 'nota inexistente: 999');

    const abierta = datos.operations.registerOperation({
      exchange_id: 'binance',
      symbol: 'BTCUSDT',
      lado: 'compra',
      tipo: 'mercado',
      cantidad: '1',
      precio_entrada: '100',
      tags: ['ruptura']
    });
    error(
      () => datos.operations.addTag(abierta.id, 'ruptura'),
      'la tag ya esta: ruptura'
    );
    error(
      () => datos.operations.removeTag(abierta.id, 'inexistente'),
      'la tag no existe: inexistente'
    );
    error(
      () => datos.operations.registerOperation({
        exchange_id: 'binance',
        symbol: 'BTCUSDT',
        lado: 'compra',
        tipo: 'mercado',
        cantidad: '1',
        precio_entrada: '100',
        tags: ['repetida', 'repetida']
      }),
      'tag repetida: repetida'
    );
    datos.operations.closeOperation(abierta.id, { precio_salida: '110', motivo_cierre: 'manual' });
    error(
      () => datos.operations.closeOperation(abierta.id, { precio_salida: '120' }),
      'la operacion no esta abierta: cerrada'
    );
  });
});

test('la migracion inicial crea el mismo esquema que schema.sql', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'datos-sqlite-'));
  const filename = path.join(directory, 'nueva.db');
  const expected = new DatabaseSync(':memory:');
  const actual = new DatabaseSync(':memory:');
  const datos = createData({ path: filename, ahora: () => 1000 });

  expected.exec(schema.replace(/^\s*PRAGMA\s+[^;]+;\s*$/gim, ''));
  applyInitialMigration(actual);
  const created = new DatabaseSync(filename);

  function schemaOf(db) {
    return db.prepare(`
      SELECT type, name, tbl_name, sql
      FROM sqlite_master
      WHERE type IN ('table', 'index')
        AND name NOT LIKE 'sqlite_%'
        AND name <> 'schema_migration'
      ORDER BY type, name
    `).all().map(record => ({
      ...record,
      sql: record.sql?.replace(/--[^\n]*/g, '').replace(/["`]/g, '').replace(/\s+/g, ' ').trim()
    }));
  }

  try {
    assert.deepEqual(schemaOf(actual), schemaOf(expected));
    assert.deepEqual(schemaOf(created), schemaOf(expected));
    assert.deepEqual(created.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    created.close();
    actual.close();
    expected.close();
    datos.close();
    rmSync(directory, { recursive: true, force: true });
  }
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
        precio_salida, fees, creada_en, abierta_en, estado
      ) VALUES (?, ?, 'compra', 'mercado', ?, ?, ?, ?, 1, 1, 'abierta')
    `);
    assert.throws(() => insertOperation.run('binance', 'BTCUSDT', '1.', '100', null, '0'), /CHECK constraint failed/);
    assert.throws(() => insertOperation.run('binance', 'BTCUSDT', '1', '1.', null, '0'), /CHECK constraint failed/);
    assert.throws(() => insertOperation.run('binance', 'BTCUSDT', '1', '100', '1.', '0'), /CHECK constraint failed/);
    assert.throws(() => insertOperation.run('binance', 'BTCUSDT', '1', '100', null, '1.'), /CHECK constraint failed/);
  } finally {
    db.close();
  }
});
