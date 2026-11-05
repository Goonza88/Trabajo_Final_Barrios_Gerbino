// implementacion SQLite de backend/datos segun database/contrato.md.
import { validateFields, defaultDatabasePath, openDatabase } from './helpers.mjs';
import { createCatalog } from './catalog.mjs';
import { createMarket } from './market.mjs';
import { createConfig } from './config.mjs';
import { createWatchlist } from './watchlist.mjs';
import { createAlerts } from './alerts.mjs';
import { createOperations } from './operations.mjs';
import { createNotes } from './notes.mjs';

export function createData(options = {}) {
  if (options == null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('se espera un objeto');
  }
  validateFields(options, ['ahora', 'path']);
  const clock = options.ahora ?? Date.now;
  if (typeof clock !== 'function') throw new Error('ahora invalido');
  const filename = options.path ?? defaultDatabasePath();
  const db = openDatabase(filename, clock);
  const catalog = createCatalog(db);
  const market = createMarket(db, clock);
  const config = createConfig(db, clock);
  const watchlist = createWatchlist(db, clock);
  const alerts = createAlerts(db, clock);
  const operations = createOperations(db, clock);
  const notes = createNotes(db, clock);

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
