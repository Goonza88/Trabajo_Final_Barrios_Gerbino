import {
  rows,
  row,
  id,
  now,
  checkSymbol,
  checkWatchlist,
  validateText,
  required,
  validateSymbolPair,
  validateFields
} from './helpers.mjs';

export function createWatchlist(db, clock) {
  return {
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
      db.prepare(`
        INSERT INTO watchlist_item (watchlist_id, exchange_id, symbol, added_at, note)
        VALUES (?, ?, ?, ?, ?)
      `).run(watchlist_id, item.exchange_id, item.symbol, stamp, note);
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
}

