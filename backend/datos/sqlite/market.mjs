import {
  rows,
  row,
  checkSymbol,
  transaction,
  validateFilter,
  INTERVALS,
  validateDecimal,
  validateNullableDecimal,
  validateInteger,
  validateInstant,
  validateEnum,
  required,
  validateSymbolPair,
  validateFields
} from './helpers.mjs';

export function createMarket(db, clock) {
  return {
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
        INSERT INTO ticker (
          exchange_id, symbol, timestamp, price, open_24h,
          high_24h, low_24h, volume_24h, quote_volume_24h
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
}

