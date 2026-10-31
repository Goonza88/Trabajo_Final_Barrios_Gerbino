// actualiza los checks de decimales sin perder datos existentes
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const schemaPath = path.join(root, 'database', 'schema.sql');

function tableDefinition(schema, name) {
  const start = schema.indexOf(`CREATE TABLE ${name} (`);
  if (start === -1) throw new Error('tabla no encontrada en schema.sql: ' + name);

  const open = schema.indexOf('(', start);
  let depth = 0;
  let quoted = false;
  let comment = false;

  for (let i = open; i < schema.length; i++) {
    const current = schema[i];
    const next = schema[i + 1];

    if (comment) {
      if (current === '\n') comment = false;
      continue;
    }
    if (quoted) {
      if (current === "'" && next === "'") {
        i++;
      } else if (current === "'") {
        quoted = false;
      }
      continue;
    }
    if (current === '-' && next === '-') {
      comment = true;
      i++;
      continue;
    }
    if (current === "'") {
      quoted = true;
      continue;
    }
    if (current === '(') depth++;
    if (current === ')' && --depth === 0) {
      return schema.slice(start, i + 1) + ';';
    }
  }

  throw new Error('definicion incompleta en schema.sql: ' + name);
}

export function up(db) {
  const schema = readFileSync(schemaPath, 'utf8');
  const alertTable = tableDefinition(schema, 'alerta')
    .replace('CREATE TABLE alerta (', 'CREATE TABLE alerta_migrada (');
  const operationTable = tableDefinition(schema, 'operacion')
    .replace('CREATE TABLE operacion (', 'CREATE TABLE operacion_migrada (');

  db.exec(alertTable);
  db.exec(operationTable);
  db.exec('INSERT INTO alerta_migrada SELECT * FROM alerta');
  db.exec('INSERT INTO operacion_migrada SELECT * FROM operacion');
  db.exec('DROP TABLE alerta');
  db.exec('DROP TABLE operacion');
  db.exec('ALTER TABLE alerta_migrada RENAME TO alerta');
  db.exec('ALTER TABLE operacion_migrada RENAME TO operacion');
  db.exec('CREATE INDEX idx_alerta_activa ON alerta(exchange_id, symbol, activa)');
  db.exec('CREATE INDEX idx_operacion_estado ON operacion(exchange_id, symbol, estado)');
  db.exec('CREATE INDEX idx_operacion_fecha ON operacion(abierta_en)');
}
