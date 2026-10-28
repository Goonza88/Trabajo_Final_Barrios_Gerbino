// migracion inicial del esquema y el catalogo local
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { INITIAL_CATALOG, INTERVALS } from '../contrato/types.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const schemaPath = path.join(root, 'database', 'schema.sql');

export function up(db) {
  // la ruta del esquema se resuelve desde este modulo.
  const schema = readFileSync(schemaPath, 'utf8');
  const withoutPragmas = schema.replace(/^\s*PRAGMA\s+[^;]+;\s*$/gim, '');
  db.exec(withoutPragmas);

  const exchange = db.prepare(
    'INSERT INTO exchange (id, nombre, base_url, ws_url, peso_por_consulta, limite_por_minuto) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const symbol = db.prepare(
    'INSERT INTO simbolo (exchange_id, symbol, base, quote) VALUES (?, ?, ?, ?)'
  );
  const interval = db.prepare(
    'INSERT INTO simbolo_intervalo (exchange_id, symbol, interval) VALUES (?, ?, ?)'
  );

  for (const row of INITIAL_CATALOG.exchange) {
    exchange.run(
      row.id,
      row.nombre,
      row.base_url,
      row.ws_url,
      row.peso_por_consulta,
      row.limite_por_minuto
    );
  }

  for (const row of INITIAL_CATALOG.simbolos) {
    symbol.run(row.exchange_id, row.symbol, row.base, row.quote);

    for (const value of INTERVALS) {
      interval.run(row.exchange_id, row.symbol, value);
    }
  }
}
