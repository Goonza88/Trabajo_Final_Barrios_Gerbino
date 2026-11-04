// implementacion SQLite de backend/datos segun database/contrato.md.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedCatalog, up as applyInitialMigration } from '../migraciones/001-inicial.mjs';
import { up as migrateDecimalChecks } from '../migraciones/002-decimales-sin-punto-final.mjs';
import {
  INTERVALS, ALERT_OPERATORS, OPERATION_SIDES,
  ORDER_TYPES, OPERATION_STATES, CONFIG_SOURCES,
} from '../contrato/types.mjs';
import {
  validateDecimal, validateNullableDecimal, validateInteger, validateInstant,
  validateBoolean, validateEnum, validateText, validateNullableText, required,
  validateSymbolPair, validateFields, validateTypeField, validateTags,
} from '../contrato/validation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '../../..');
const SCHEMA = path.join(PROJECT, 'database', 'schema.sql');
const MIGRATIONS = [
  { id: '001-inicial', up: applyInitialMigration },
  { id: '002-decimales-sin-punto-final', up: migrateDecimalChecks, foreignKeysOff: true },
];

function rows(stmt, ...args) {
  return stmt.all(...args).map(row => ({ ...row }));
}

function row(stmt, ...args) {
  const value = stmt.get(...args);
  return value ? { ...value } : null;
}

function id(value, field = 'id') {
  return validateInteger(required(value, field), field, 1);
}

function now(clock, field = 'updated_at') {
  return validateInstant(clock(), field);
}

function assertExists(value, entity, label) {
  if (!value) throw new Error(entity + ' inexistente: ' + label);
  return value;
}

function checkSymbol(db, exchange_id, symbol) {
  validateSymbolPair({ exchange_id, symbol });
  const symbolRow = db.prepare(
    'SELECT 1 AS ok FROM simbolo WHERE exchange_id=? AND symbol=?'
  ).get(exchange_id, symbol);
  assertExists(symbolRow, 'simbolo', exchange_id + '/' + symbol);
}
function checkWatchlist(db, value) {
  id(value, 'watchlist_id');
  const watchlist = db.prepare('SELECT 1 AS ok FROM watchlist WHERE id=?').get(value);
  assertExists(watchlist, 'watchlist', value);
}

function checkOperation(db, value) {
  id(value, 'operacion_id');
  const operation = row(db.prepare('SELECT * FROM operacion WHERE id=?'), value);
  return assertExists(operation, 'operacion', value);
}

function checkNote(db, value) {
  id(value, 'nota_id');
  const note = row(db.prepare('SELECT * FROM nota WHERE id=?'), value);
  return assertExists(note, 'nota', value);
}

function checkAlert(db, value) {
  id(value, 'alerta_id');
  const alert = row(db.prepare('SELECT * FROM alerta WHERE id=?'), value);
  return assertExists(alert, 'alerta', value);
}

function attachTags(db, table, key, records) {
  return records.map(record => {
    const tags = rows(
      db.prepare('SELECT tag FROM ' + table + ' WHERE ' + key + '=? ORDER BY tag'),
      record.id
    ).map(value => value.tag);
    return { ...record, tags };
  });
}

function oneWithTags(db, table, key, record) {
  if (!record) return null;
  const tags = rows(
    db.prepare('SELECT tag FROM ' + table + ' WHERE ' + key + '=? ORDER BY tag'),
    record.id
  )
    .map(value => value.tag);
  return { ...record, tags };
}

function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = callback();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function validateFilter(filter, allowed) {
  validateFields(filter, allowed);
}

export function createData(options = {}) {
  if (options == null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('se espera un objeto');
  }
  validateFields(options, ['ahora', 'path']);
  const clock = options.ahora ?? Date.now;
  if (typeof clock !== 'function') throw new Error('ahora invalido');
  const filename = options.path ?? path.join(PROJECT, 'data', 'app.db');
  if (filename !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);
  const existingTables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all();
  db.exec('CREATE TABLE IF NOT EXISTS schema_migration (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  if (existingTables.length === 0) {
    // Las bases nuevas nacen con el esquema actual y registran el historial completo.
    const schema = readFileSync(SCHEMA, 'utf8').replace(/^\s*PRAGMA\s+[^;]+;\s*$/gim, '');
    db.exec(schema);
    seedCatalog(db);
    const markApplied = db.prepare('INSERT INTO schema_migration(id,applied_at) VALUES (?,?)');
    for (const migration of MIGRATIONS) {
      markApplied.run(migration.id, now(clock, 'applied_at'));
    }
  } else {
    for (const migration of MIGRATIONS) {
      const applied = db.prepare('SELECT 1 AS ok FROM schema_migration WHERE id=?').get(migration.id);
      if (applied) continue;

      if (migration.foreignKeysOff) db.exec('PRAGMA foreign_keys = OFF');
      try {
        transaction(db, () => {
          migration.up(db);
          db.prepare('INSERT INTO schema_migration(id,applied_at) VALUES (?,?)').run(
            migration.id,
            now(clock, 'applied_at')
          );
        });
      } finally {
        if (migration.foreignKeysOff) db.exec('PRAGMA foreign_keys = ON');
      }
      if (migration.foreignKeysOff) {
        const violations = rows(db.prepare('PRAGMA foreign_key_check'));
        if (violations.length > 0) {
          throw new Error('foreign key check fallo: ' + JSON.stringify(violations[0]));
        }
      }
    }
  }

  const catalog = {
    listExchanges() {
      return rows(db.prepare('SELECT * FROM exchange ORDER BY id'));
    },
    getExchange(exchangeId) {
      validateText(required(exchangeId, 'id'), 'id');
      return row(db.prepare('SELECT * FROM exchange WHERE id=?'), exchangeId);
    },
    registerExchange(exchange) {
      validateFields(exchange, ['id', 'nombre', 'base_url', 'ws_url', 'peso_por_consulta', 'limite_por_minuto']);
      for (const f of ['id', 'nombre', 'base_url', 'ws_url']) validateText(required(exchange?.[f], f), f);
      for (const f of ['peso_por_consulta', 'limite_por_minuto']) validateInteger(required(exchange?.[f], f), f, 1);
      if (db.prepare('SELECT 1 FROM exchange WHERE id=?').get(exchange.id)) {
        throw new Error('exchange ya registrado: ' + exchange.id);
      }
      db.prepare('INSERT INTO exchange VALUES (?,?,?,?,?,?)').run(
        exchange.id,
        exchange.nombre,
        exchange.base_url,
        exchange.ws_url,
        exchange.peso_por_consulta,
        exchange.limite_por_minuto
      );
      return row(db.prepare('SELECT * FROM exchange WHERE id=?'), exchange.id);
    },
    registerSymbol(symbol) {
      validateFields(symbol, ['exchange_id', 'symbol', 'base', 'quote']);
      for (const f of ['exchange_id', 'symbol', 'base', 'quote']) validateText(required(symbol?.[f], f), f);
      if (!db.prepare('SELECT 1 FROM exchange WHERE id=?').get(symbol.exchange_id)) {
        throw new Error('exchange inexistente: ' + symbol.exchange_id);
      }
      if (db.prepare('SELECT 1 FROM simbolo WHERE exchange_id=? AND symbol=?').get(symbol.exchange_id, symbol.symbol)) {
        throw new Error('simbolo ya registrado: ' + symbol.exchange_id + '/' + symbol.symbol);
      }
      db.prepare('INSERT INTO simbolo VALUES (?,?,?,?)').run(symbol.exchange_id, symbol.symbol, symbol.base, symbol.quote);
      return row(db.prepare('SELECT * FROM simbolo WHERE exchange_id=? AND symbol=?'), symbol.exchange_id, symbol.symbol);
    },
    listSymbols(filter = {}) {
      validateFilter(filter, ['exchange']);
      if (filter.exchange != null) validateText(filter.exchange, 'exchange');
      return filter.exchange == null
        ? rows(db.prepare('SELECT * FROM simbolo ORDER BY exchange_id,symbol'))
        : rows(db.prepare('SELECT * FROM simbolo WHERE exchange_id=? ORDER BY exchange_id,symbol'), filter.exchange);
    },
    enableInterval(exchange_id, symbol, interval) {
      validateEnum(required(interval, 'interval'), 'interval', INTERVALS);
      checkSymbol(db, exchange_id, symbol);
      db.prepare('INSERT INTO simbolo_intervalo(exchange_id,symbol,interval) VALUES (?,?,?) ON CONFLICT DO NOTHING').run(exchange_id, symbol, interval);
    },
    listIntervals(exchange_id, symbol) {
      validateSymbolPair({exchange_id, symbol});
      return rows(db.prepare('SELECT interval FROM simbolo_intervalo WHERE exchange_id=? AND symbol=?'), exchange_id, symbol)
        .map(value => value.interval)
        .sort((a, b) => INTERVALS.indexOf(a) - INTERVALS.indexOf(b));
    },
  };

  const market = {
    saveCandles(candles) {
      if (!Array.isArray(candles)) throw new Error('se espera una lista de velas');
      const allowed = ['exchange_id', 'symbol', 'interval', 'open_time', 'open', 'high', 'low', 'close', 'volume', 'close_time', 'quote_volume', 'trades', 'ingested_at'];
      const stmt = db.prepare(`
        INSERT INTO kline (
          exchange_id, symbol, interval, open_time, open, high, low, close,
          volume, close_time, quote_volume, trades, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(exchange_id, symbol, interval, open_time) DO UPDATE SET
          open=excluded.open,
          high=excluded.high,
          low=excluded.low,
          close=excluded.close,
          volume=excluded.volume,
          close_time=excluded.close_time,
          quote_volume=excluded.quote_volume,
          trades=excluded.trades,
          ingested_at=excluded.ingested_at
      `);
      return transaction(db, () => {
        for (const candle of candles) {
          validateFields(candle, allowed);
          validateSymbolPair(candle);
          validateEnum(required(candle.interval, 'interval'), 'interval', INTERVALS);
          validateInstant(required(candle.open_time, 'open_time'), 'open_time');
          validateInstant(required(candle.close_time, 'close_time'), 'close_time');
          validateInstant(required(candle.ingested_at, 'ingested_at'), 'ingested_at');
          for (const field of ['open', 'high', 'low', 'close', 'volume', 'quote_volume']) {
            validateDecimal(required(candle[field], field), field);
          }
          if (candle.trades != null) validateInteger(candle.trades, 'trades');
          const enabled = db.prepare(
            'SELECT 1 FROM simbolo_intervalo WHERE exchange_id=? AND symbol=? AND interval=?'
          ).get(candle.exchange_id, candle.symbol, candle.interval);
          if (!enabled) {
            throw new Error('intervalo no habilitado: ' + candle.exchange_id + '/' + candle.symbol + '/' + candle.interval);
          }
          stmt.run(
            candle.exchange_id,
            candle.symbol,
            candle.interval,
            candle.open_time,
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            candle.volume,
            candle.close_time,
            candle.quote_volume,
            candle.trades ?? null,
            candle.ingested_at
          );
        }
        return candles.length;
      });
    },
    readCandles(filter) {
      validateFilter(filter, ['exchange_id', 'symbol', 'interval', 'desde', 'hasta', 'limite']);
      validateSymbolPair(filter);
      validateEnum(required(filter.interval, 'interval'), 'interval', INTERVALS);
      if (filter.desde != null) validateInstant(filter.desde, 'desde');
      if (filter.hasta != null) validateInstant(filter.hasta, 'hasta');
      if (filter.limite != null) validateInteger(filter.limite, 'limite', 1);
      let sql = 'SELECT * FROM kline WHERE exchange_id=? AND symbol=? AND interval=?';
      const args = [filter.exchange_id, filter.symbol, filter.interval];
      if (filter.desde != null) {
        sql += ' AND open_time>=?';
        args.push(filter.desde);
      }
      if (filter.hasta != null) {
        sql += ' AND open_time<?';
        args.push(filter.hasta);
      }
      if (filter.limite != null) {
        sql += ' ORDER BY open_time DESC LIMIT ?';
        args.push(filter.limite);
        return rows(db.prepare(sql), ...args).reverse();
      }
      return rows(db.prepare(sql + ' ORDER BY open_time'), ...args);
    },
    saveTicker(ticker) {
      const fields = ['exchange_id', 'symbol', 'timestamp', 'price', 'open_24h', 'high_24h', 'low_24h', 'volume_24h', 'quote_volume_24h'];
      validateFields(ticker, fields);
      validateInstant(required(ticker.timestamp, 'timestamp'), 'timestamp');
      validateDecimal(required(ticker.price, 'price'), 'price');
      for (const field of fields.slice(4)) validateNullableDecimal(ticker[field], field);
      checkSymbol(db, ticker.exchange_id, ticker.symbol);
      db.prepare(`
        INSERT INTO ticker VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(exchange_id, symbol, timestamp) DO UPDATE SET
          price=excluded.price,
          open_24h=excluded.open_24h,
          high_24h=excluded.high_24h,
          low_24h=excluded.low_24h,
          volume_24h=excluded.volume_24h,
          quote_volume_24h=excluded.quote_volume_24h
      `).run(
        ticker.exchange_id,
        ticker.symbol,
        ticker.timestamp,
        ticker.price,
        ticker.open_24h ?? null,
        ticker.high_24h ?? null,
        ticker.low_24h ?? null,
        ticker.volume_24h ?? null,
        ticker.quote_volume_24h ?? null
      );
      return row(db.prepare('SELECT * FROM ticker WHERE exchange_id=? AND symbol=? AND timestamp=?'), ticker.exchange_id, ticker.symbol, ticker.timestamp);
    },
    readLastTicker(exchange_id, symbol) {
      validateSymbolPair({exchange_id, symbol});
      return row(db.prepare('SELECT * FROM ticker WHERE exchange_id=? AND symbol=? ORDER BY timestamp DESC LIMIT 1'), exchange_id, symbol);
    },
  };

  const config = {
    readConfig() {
      return row(db.prepare('SELECT * FROM config WHERE id=?'), 'local');
    },
    saveConfig(value) {
      validateFields(value, ['intervalo_por_defecto', 'exchange_id', 'simbolo_por_defecto', 'fuente', 'fuente_url', 'sondeo_ms']);
      validateEnum(required(value?.intervalo_por_defecto, 'intervalo_por_defecto'), 'intervalo_por_defecto', INTERVALS);
      validateEnum(required(value?.fuente, 'fuente'), 'fuente', CONFIG_SOURCES);
      validateInteger(required(value?.sondeo_ms, 'sondeo_ms'), 'sondeo_ms', 1);
      const exchange_id = value.exchange_id ?? null;
      const symbol = value.simbolo_por_defecto ?? null;
      const url = value.fuente_url ?? null;
      if ((exchange_id == null) !== (symbol == null)) {
        throw new Error('exchange_id y simbolo_por_defecto van juntos');
      }
      if (exchange_id != null) {
        validateText(required(exchange_id, 'exchange_id'), 'exchange_id');
        validateText(required(symbol, 'simbolo_por_defecto'), 'simbolo_por_defecto');
        const symbolRow = db.prepare(
          'SELECT 1 AS ok FROM simbolo WHERE exchange_id=? AND symbol=?'
        ).get(exchange_id, symbol);
        assertExists(symbolRow, 'simbolo', exchange_id + '/' + symbol);
        const enabled = db.prepare(
          'SELECT 1 FROM simbolo_intervalo WHERE exchange_id=? AND symbol=? AND interval=?'
        ).get(exchange_id, symbol, value.intervalo_por_defecto);
        if (!enabled) {
          throw new Error('el intervalo ' + value.intervalo_por_defecto + ' no esta habilitado para ' + exchange_id + '/' + symbol);
        }
      }
      if (value.fuente === 'remoto' && url == null) {
        throw new Error('fuente remoto necesita fuente_url');
      }
      if (value.fuente === 'local' && url != null) {
        throw new Error('fuente_url solo va en remoto');
      }
      if (url != null) validateText(url, 'fuente_url');
      const stamp = now(clock);
      db.prepare(`
        INSERT INTO config VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          intervalo_por_defecto=excluded.intervalo_por_defecto,
          exchange_id=excluded.exchange_id,
          simbolo_por_defecto=excluded.simbolo_por_defecto,
          fuente=excluded.fuente,
          fuente_url=excluded.fuente_url,
          sondeo_ms=excluded.sondeo_ms,
          actualizado_en=excluded.actualizado_en
      `).run('local', value.intervalo_por_defecto, exchange_id, symbol, value.fuente, url, value.sondeo_ms, stamp);
      return row(db.prepare('SELECT * FROM config WHERE id=?'), 'local');
    },
  };

  const watchlist = {
    listWatchlists() {
      return rows(db.prepare('SELECT * FROM watchlist ORDER BY id'));
    },
    createWatchlist(name) {
      validateText(required(name, 'nombre'), 'nombre');
      const stamp = now(clock, 'created_at');
      const result = db.prepare('INSERT INTO watchlist(nombre,created_at,updated_at) VALUES (?,?,?)').run(name, stamp, stamp);
      return row(db.prepare('SELECT * FROM watchlist WHERE id=?'), Number(result.lastInsertRowid));
    },
    renameWatchlist(watchlist_id, name) {
      checkWatchlist(db, watchlist_id);
      validateText(required(name, 'nombre'), 'nombre');
      db.prepare('UPDATE watchlist SET nombre=?,updated_at=? WHERE id=?').run(name, now(clock), watchlist_id);
      return row(db.prepare('SELECT * FROM watchlist WHERE id=?'), watchlist_id);
    },
    deleteWatchlist(watchlist_id) {
      checkWatchlist(db, watchlist_id);
      db.prepare('DELETE FROM watchlist WHERE id=?').run(watchlist_id);
    },
    listItems(watchlist_id) {
      id(watchlist_id, 'watchlist_id');
      return rows(db.prepare('SELECT * FROM watchlist_item WHERE watchlist_id=? ORDER BY added_at,exchange_id,symbol'), watchlist_id);
    },
    addItem(watchlist_id, item) {
      checkWatchlist(db, watchlist_id);
      validateFields(item, ['exchange_id', 'symbol', 'note']);
      const note = item.note == null ? null : validateText(item.note, 'note');
      checkSymbol(db, item.exchange_id, item.symbol);
      const exists = db.prepare(
        'SELECT 1 FROM watchlist_item WHERE watchlist_id=? AND exchange_id=? AND symbol=?'
      ).get(watchlist_id, item.exchange_id, item.symbol);
      if (exists) {
        throw new Error('el simbolo ya esta en la watchlist: ' + item.exchange_id + '/' + item.symbol);
      }
      const stamp = now(clock, 'added_at');
      db.prepare('INSERT INTO watchlist_item VALUES (?,?,?,?,?)').run(watchlist_id, item.exchange_id, item.symbol, stamp, note);
      return row(db.prepare('SELECT * FROM watchlist_item WHERE watchlist_id=? AND exchange_id=? AND symbol=?'), watchlist_id, item.exchange_id, item.symbol);
    },
    removeItem(watchlist_id, exchange_id, symbol) {
      checkWatchlist(db, watchlist_id);
      validateSymbolPair({exchange_id, symbol});
      const exists = db.prepare(
        'SELECT 1 FROM watchlist_item WHERE watchlist_id=? AND exchange_id=? AND symbol=?'
      ).get(watchlist_id, exchange_id, symbol);
      if (!exists) {
        throw new Error('el simbolo no esta en la watchlist: ' + exchange_id + '/' + symbol);
      }
      db.prepare('DELETE FROM watchlist_item WHERE watchlist_id=? AND exchange_id=? AND symbol=?').run(watchlist_id, exchange_id, symbol);
    },
    editItem(watchlist_id, exchange_id, symbol, changes) {
      checkWatchlist(db, watchlist_id);
      validateSymbolPair({exchange_id, symbol});
      validateFields(changes, ['note']);
      if (!Object.hasOwn(changes, 'note')) throw new Error('parametro requerido: note');
      const note = changes.note == null ? null : validateText(changes.note, 'note');
      const exists = db.prepare('SELECT 1 FROM watchlist_item WHERE watchlist_id=? AND exchange_id=? AND symbol=?').get(watchlist_id, exchange_id, symbol);
      if (!exists) throw new Error('el simbolo no esta en la watchlist: ' + exchange_id + '/' + symbol);
      db.prepare('UPDATE watchlist_item SET note=? WHERE watchlist_id=? AND exchange_id=? AND symbol=?').run(note, watchlist_id, exchange_id, symbol);
      return row(db.prepare('SELECT * FROM watchlist_item WHERE watchlist_id=? AND exchange_id=? AND symbol=?'), watchlist_id, exchange_id, symbol);
    },
  };

  const alerts = {
    createAlert(alert) {
      validateFields(alert, ['exchange_id', 'symbol', 'tipo', 'campo', 'operador', 'valor', 'timeframe', 'activa', 'note']);
      validateTypeField(required(alert?.tipo, 'tipo'), required(alert?.campo, 'campo'));
      validateEnum(required(alert?.operador, 'operador'), 'operador', ALERT_OPERATORS);
      validateDecimal(required(alert?.valor, 'valor'), 'valor');
      validateEnum(required(alert?.timeframe, 'timeframe'), 'timeframe', INTERVALS);
      const active = alert.activa ?? 1;
      validateBoolean(active, 'activa');
      const note = alert.note == null ? null : validateText(alert.note, 'note');
      checkSymbol(db, alert.exchange_id, alert.symbol);
      const stamp = now(clock, 'created_at');
      const result = db.prepare(`
        INSERT INTO alerta (
          exchange_id, symbol, tipo, campo, operador, valor, timeframe,
          activa, disparada, ultimo_disparo, disparos, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?, ?)
      `).run(
        alert.exchange_id,
        alert.symbol,
        alert.tipo,
        alert.campo,
        alert.operador,
        alert.valor,
        alert.timeframe,
        active,
        note,
        stamp,
        stamp
      );
      return row(db.prepare('SELECT * FROM alerta WHERE id=?'), Number(result.lastInsertRowid));
    },
    listAlerts(filter = {}) {
      validateFilter(filter, ['exchange_id', 'symbol', 'activas']);
      if (filter.exchange_id != null) validateText(filter.exchange_id, 'exchange_id');
      if (filter.symbol != null) validateText(filter.symbol, 'symbol');
      if (filter.activas != null) validateBoolean(filter.activas, 'activas');
      let sql = 'SELECT * FROM alerta WHERE 1=1', args = [];
      if (filter.exchange_id != null) {
        sql += ' AND exchange_id=?';
        args.push(filter.exchange_id);
      }
      if (filter.symbol != null) {
        sql += ' AND symbol=?';
        args.push(filter.symbol);
      }
      if (filter.activas != null) {
        sql += ' AND activa=?';
        args.push(filter.activas);
      }
      return rows(db.prepare(sql + ' ORDER BY id'), ...args);
    },
    updateAlert(alert_id, changes) {
      id(alert_id, 'alerta_id');
      validateFields(changes, ['exchange_id', 'symbol', 'tipo', 'campo', 'operador', 'valor', 'timeframe', 'activa', 'note']);
      const current = checkAlert(db, alert_id);
      const merged = { ...current, ...changes };
      for (const state of ['id', 'disparada', 'ultimo_disparo', 'disparos', 'created_at', 'updated_at']) {
        delete merged[state];
      }
      validateTypeField(merged.tipo, merged.campo);
      validateEnum(merged.operador, 'operador', ALERT_OPERATORS);
      validateDecimal(merged.valor, 'valor');
      validateEnum(merged.timeframe, 'timeframe', INTERVALS);
      validateBoolean(merged.activa, 'activa');
      validateNullableText(merged.note, 'note');
      checkSymbol(db, merged.exchange_id, merged.symbol);
      db.prepare(`
        UPDATE alerta
        SET exchange_id=?, symbol=?, tipo=?, campo=?, operador=?, valor=?,
          timeframe=?, activa=?, note=?, updated_at=?
        WHERE id=?
      `).run(
        merged.exchange_id,
        merged.symbol,
        merged.tipo,
        merged.campo,
        merged.operador,
        merged.valor,
        merged.timeframe,
        merged.activa,
        merged.note,
        now(clock),
        alert_id
      );
      return row(db.prepare('SELECT * FROM alerta WHERE id=?'), alert_id);
    },
    deleteAlert(alert_id) {
      checkAlert(db, alert_id);
      db.prepare('DELETE FROM alerta WHERE id=?').run(alert_id);
    },
    markTriggered(alert_id) {
      const current = checkAlert(db, alert_id);
      const stamp = now(clock);
      db.prepare('UPDATE alerta SET disparada=1,disparos=disparos+1,ultimo_disparo=?,updated_at=? WHERE id=?').run(stamp, stamp, alert_id);
      return row(db.prepare('SELECT * FROM alerta WHERE id=?'), current.id);
    },
  };

  const operations = {
    registerOperation(value) {
      validateFields(value, ['exchange_id', 'symbol', 'lado', 'tipo', 'cantidad', 'precio_entrada', 'fees', 'notas', 'tags']);
      validateEnum(required(value?.lado, 'lado'), 'lado', OPERATION_SIDES);
      validateEnum(required(value?.tipo, 'tipo'), 'tipo', ORDER_TYPES);
      validateDecimal(required(value?.cantidad, 'cantidad'), 'cantidad');
      validateDecimal(required(value?.precio_entrada, 'precio_entrada'), 'precio_entrada');
      const fees = value.fees ?? '0';
      validateDecimal(fees, 'fees');
      const notas = value.notas == null ? null : validateText(value.notas, 'notas');
      const tags = validateTags(value.tags);
      checkSymbol(db, value.exchange_id, value.symbol);
      const stamp = now(clock, 'abierta_en');
      return transaction(db, () => {
        const result = db.prepare(`
          INSERT INTO operacion (
            exchange_id, symbol, lado, tipo, cantidad, precio_entrada,
            precio_salida, fees, abierta_en, cerrada_en, estado, notas
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, 'abierta', ?)
        `).run(value.exchange_id, value.symbol, value.lado, value.tipo, value.cantidad, value.precio_entrada, fees, stamp, notas);
        const operationId = Number(result.lastInsertRowid);
        const add = db.prepare('INSERT INTO operacion_tag VALUES (?,?)');
        for (const tag of tags) add.run(operationId, tag);
        const operation = row(db.prepare('SELECT * FROM operacion WHERE id=?'), operationId);
        return oneWithTags(db, 'operacion_tag', 'operacion_id', operation);
      });
    },
    listOperations(filter = {}) {
      validateFilter(filter, ['exchange_id', 'symbol', 'estado']);
      if (filter.exchange_id != null) validateText(filter.exchange_id, 'exchange_id');
      if (filter.symbol != null) validateText(filter.symbol, 'symbol');
      if (filter.estado != null) validateEnum(filter.estado, 'estado', OPERATION_STATES);
      let sql = 'SELECT * FROM operacion WHERE 1=1', args = [];
      if (filter.exchange_id != null) {
        sql += ' AND exchange_id=?';
        args.push(filter.exchange_id);
      }
      if (filter.symbol != null) {
        sql += ' AND symbol=?';
        args.push(filter.symbol);
      }
      if (filter.estado != null) {
        sql += ' AND estado=?';
        args.push(filter.estado);
      }
      const operations = rows(db.prepare(sql + ' ORDER BY id'), ...args);
      return attachTags(db, 'operacion_tag', 'operacion_id', operations);
    },
    getOperation(operation_id) {
      id(operation_id, 'operacion_id');
      const operation = row(db.prepare('SELECT * FROM operacion WHERE id=?'), operation_id);
      return oneWithTags(db, 'operacion_tag', 'operacion_id', operation);
    },
    closeOperation(operation_id, closing) {
      const current = checkOperation(db, operation_id);
      if (current.estado !== 'abierta') throw new Error('la operacion no esta abierta: ' + current.estado);
      validateFields(closing, ['precio_salida', 'fees']);
      validateDecimal(required(closing?.precio_salida, 'precio_salida'), 'precio_salida');
      const fees = closing.fees == null ? current.fees : validateDecimal(closing.fees, 'fees');
      db.prepare("UPDATE operacion SET estado='cerrada',precio_salida=?,cerrada_en=?,fees=? WHERE id=?").run(closing.precio_salida, now(clock), fees, operation_id);
      const operation = row(db.prepare('SELECT * FROM operacion WHERE id=?'), operation_id);
      return oneWithTags(db, 'operacion_tag', 'operacion_id', operation);
    },
    cancelOperation(operation_id) {
      const current = checkOperation(db, operation_id);
      if (current.estado !== 'abierta') throw new Error('la operacion no esta abierta: ' + current.estado);
      db.prepare("UPDATE operacion SET estado='cancelada',precio_salida=NULL,cerrada_en=? WHERE id=?").run(now(clock), operation_id);
      const operation = row(db.prepare('SELECT * FROM operacion WHERE id=?'), operation_id);
      return oneWithTags(db, 'operacion_tag', 'operacion_id', operation);
    },
    addTag(operation_id, tag) {
      checkOperation(db, operation_id);
      validateText(required(tag, 'tag'), 'tag');
      if (db.prepare('SELECT 1 FROM operacion_tag WHERE operacion_id=? AND tag=?').get(operation_id, tag)) {
        throw new Error('la tag ya esta: ' + tag);
      }
      db.prepare('INSERT INTO operacion_tag VALUES (?,?)').run(operation_id, tag);
      return rows(db.prepare('SELECT tag FROM operacion_tag WHERE operacion_id=? ORDER BY tag'), operation_id)
        .map(value => value.tag);
    },
    removeTag(operation_id, tag) {
      checkOperation(db, operation_id);
      validateText(required(tag, 'tag'), 'tag');
      if (!db.prepare('SELECT 1 FROM operacion_tag WHERE operacion_id=? AND tag=?').get(operation_id, tag)) {
        throw new Error('la tag no existe: ' + tag);
      }
      db.prepare('DELETE FROM operacion_tag WHERE operacion_id=? AND tag=?').run(operation_id, tag);
      return rows(db.prepare('SELECT tag FROM operacion_tag WHERE operacion_id=? ORDER BY tag'), operation_id)
        .map(value => value.tag);
    },
  };

  const notes = {
    createNote(value) {
      validateFields(value, ['exchange_id', 'symbol', 'titulo', 'cuerpo', 'tags']);
      const exchange_id = value.exchange_id ?? null;
      const symbol = value.symbol ?? null;
      if ((exchange_id == null) !== (symbol == null)) {
        throw new Error('exchange_id y symbol van juntos');
      }
      if (exchange_id != null) {
        checkSymbol(db, exchange_id, symbol);
      }
      validateText(required(value?.titulo, 'titulo'), 'titulo');
      validateText(required(value?.cuerpo, 'cuerpo'), 'cuerpo');
      const tags = validateTags(value.tags);
      const stamp = now(clock, 'created_at');
      return transaction(db, () => {
        const result = db.prepare(`
          INSERT INTO nota (
            exchange_id, symbol, titulo, cuerpo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(exchange_id, symbol, value.titulo, value.cuerpo, stamp, stamp);
        const noteId = Number(result.lastInsertRowid);
        const add = db.prepare('INSERT INTO nota_tag VALUES (?,?)');
        for (const tag of tags) add.run(noteId, tag);
        const note = row(db.prepare('SELECT * FROM nota WHERE id=?'), noteId);
        return oneWithTags(db, 'nota_tag', 'nota_id', note);
      });
    },
    listNotes(filter = {}) {
      validateFilter(filter, ['exchange_id', 'symbol', 'busqueda']);
      if (filter.exchange_id != null) validateText(filter.exchange_id, 'exchange_id');
      if (filter.symbol != null) validateText(filter.symbol, 'symbol');
      if (filter.busqueda != null) validateText(filter.busqueda, 'busqueda');
      let sql = 'SELECT * FROM nota WHERE 1=1';
      const args = [];
      if (filter.exchange_id != null) {
        sql += ' AND exchange_id=?';
        args.push(filter.exchange_id);
      }
      if (filter.symbol != null) {
        sql += ' AND symbol=?';
        args.push(filter.symbol);
      }
      const records = rows(db.prepare(sql + ' ORDER BY id'), ...args);
      if (filter.busqueda != null) {
        const busqueda = filter.busqueda.toLocaleLowerCase('es');
        const matchingNotes = records.filter(note =>
          note.titulo.toLocaleLowerCase('es').includes(busqueda) ||
          note.cuerpo.toLocaleLowerCase('es').includes(busqueda)
        );
        return attachTags(db, 'nota_tag', 'nota_id', matchingNotes);
      }
      return attachTags(db, 'nota_tag', 'nota_id', records);
    },
    editNote(note_id, changes) {
      const current = checkNote(db, note_id);
      validateFields(changes, ['exchange_id', 'symbol', 'titulo', 'cuerpo']);
      const merged = { ...current, ...changes };
      if ((merged.exchange_id == null) !== (merged.symbol == null)) {
        throw new Error('exchange_id y symbol van juntos');
      }
      if (merged.exchange_id != null) {
        checkSymbol(db, merged.exchange_id, merged.symbol);
      }
      validateText(merged.titulo, 'titulo');
      validateText(merged.cuerpo, 'cuerpo');
      db.prepare('UPDATE nota SET exchange_id=?,symbol=?,titulo=?,cuerpo=?,updated_at=? WHERE id=?').run(merged.exchange_id ?? null, merged.symbol ?? null, merged.titulo, merged.cuerpo, now(clock), note_id);
      const note = row(db.prepare('SELECT * FROM nota WHERE id=?'), note_id);
      return oneWithTags(db, 'nota_tag', 'nota_id', note);
    },
    deleteNote(note_id) {
      checkNote(db, note_id);
      db.prepare('DELETE FROM nota WHERE id=?').run(note_id);
    },
    addTag(note_id, tag) {
      checkNote(db, note_id);
      validateText(required(tag, 'tag'), 'tag');
      if (db.prepare('SELECT 1 FROM nota_tag WHERE nota_id=? AND tag=?').get(note_id, tag)) {
        throw new Error('la tag ya esta: ' + tag);
      }
      db.prepare('INSERT INTO nota_tag VALUES (?,?)').run(note_id, tag);
      return rows(db.prepare('SELECT tag FROM nota_tag WHERE nota_id=? ORDER BY tag'), note_id)
        .map(value => value.tag);
    },
    removeTag(note_id, tag) {
      checkNote(db, note_id);
      validateText(required(tag, 'tag'), 'tag');
      if (!db.prepare('SELECT 1 FROM nota_tag WHERE nota_id=? AND tag=?').get(note_id, tag)) {
        throw new Error('la tag no existe: ' + tag);
      }
      db.prepare('DELETE FROM nota_tag WHERE nota_id=? AND tag=?').run(note_id, tag);
      return rows(db.prepare('SELECT tag FROM nota_tag WHERE nota_id=? ORDER BY tag'), note_id)
        .map(value => value.tag);
    },
  };

  return {
    catalog,
    market,
    config,
    watchlist,
    alerts,
    operations,
    notes,
    close() {
      db.close();
    },
  };
}
