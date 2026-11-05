import {
  rows,
  row,
  id,
  checkSymbol,
  validateFilter,
  INTERVALS,
  validateInteger,
  validateEnum,
  validateText,
  required,
  validateSymbolPair,
  validateFields
} from './helpers.mjs';

export function createCatalog(db) {
  return {
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
      db.prepare(`
        INSERT INTO exchange (
          id, nombre, base_url, ws_url, peso_por_consulta, limite_por_minuto
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
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
      db.prepare(`
        INSERT INTO simbolo (exchange_id, symbol, base, quote)
        VALUES (?, ?, ?, ?)
      `).run(symbol.exchange_id, symbol.symbol, symbol.base, symbol.quote);
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
}

