// helpers compartidos para la implementacion SQLite de backend/datos.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { up as applyInitialMigration } from '../migraciones/001-inicial.mjs';
import {
  INTERVALS, ALERT_OPERATORS, OPERATION_SIDES,
  ORDER_TYPES, OPERATION_STATES, CLOSE_REASONS, CONFIG_SOURCES,
} from '../contrato/types.mjs';
import {
  validateDecimal, validateNullableDecimal, validateInteger, validateInstant,
  validateBoolean, validateEnum, validateText, validateNullableText, required,
  validateSymbolPair, validateFields, validateTypeField, validateTags,
} from '../contrato/validation.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '../../..');
const MIGRATIONS = [
  { id: '001-inicial', up: applyInitialMigration },
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
  if (records.length === 0) return [];
  const ids = records.map(record => record.id);
  const placeholders = ids.map(() => '?').join(', ');
  const taggedRecords = rows(
    db.prepare(
      'SELECT ' + key + ', tag FROM ' + table +
      ' WHERE ' + key + ' IN (' + placeholders + ') ORDER BY ' + key + ', tag'
    ),
    ...ids
  );
  const tagsById = new Map();
  for (const taggedRecord of taggedRecords) {
    const id = taggedRecord[key];
    if (!tagsById.has(id)) tagsById.set(id, []);
    tagsById.get(id).push(taggedRecord.tag);
  }
  return records.map(record => ({
    ...record,
    tags: tagsById.get(record.id) ?? [],
  }));
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

function initializeDatabase(db, clock) {
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
    const migration = MIGRATIONS[0];
    transaction(db, () => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migration(id,applied_at) VALUES (?,?)').run(
        migration.id,
        now(clock, 'applied_at')
      );
    });
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
}


export function defaultDatabasePath() {
  return path.join(PROJECT, 'data', 'app.db');
}

export function openDatabase(filename, clock) {
  if (filename !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  try {
    initializeDatabase(db, clock);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

export {
  rows, row, id, now, assertExists, checkSymbol, checkWatchlist,
  checkOperation, checkNote, checkAlert, attachTags, oneWithTags,
  transaction, validateFilter,
  INTERVALS, ALERT_OPERATORS, OPERATION_SIDES, ORDER_TYPES,
  OPERATION_STATES, CLOSE_REASONS, CONFIG_SOURCES,
  validateDecimal, validateNullableDecimal, validateInteger, validateInstant,
  validateBoolean, validateEnum, validateText, validateNullableText, required,
  validateSymbolPair, validateFields, validateTypeField, validateTags,
};
