import {
  row,
  id,
  now,
  assertExists,
  INTERVALS,
  CONFIG_SOURCES,
  validateDecimal,
  validateInteger,
  validateEnum,
  validateText,
  required,
  validateFields
} from './helpers.mjs';

export function createConfig(db, clock) {
  return {
    readConfig() {
      return row(db.prepare('SELECT * FROM config WHERE id=?'), 'local');
    },
    saveConfig(value) {
      validateFields(value, ['intervalo_por_defecto', 'saldo_inicial', 'exchange_id', 'simbolo_por_defecto', 'fuente', 'fuente_url', 'sondeo_ms']);
      validateEnum(required(value?.intervalo_por_defecto, 'intervalo_por_defecto'), 'intervalo_por_defecto', INTERVALS);
      validateDecimal(required(value?.saldo_inicial, 'saldo_inicial'), 'saldo_inicial');
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
        INSERT INTO config (
          id, intervalo_por_defecto, saldo_inicial, exchange_id, simbolo_por_defecto,
          fuente, fuente_url, sondeo_ms, actualizado_en
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          intervalo_por_defecto=excluded.intervalo_por_defecto,
          saldo_inicial=excluded.saldo_inicial,
          exchange_id=excluded.exchange_id,
          simbolo_por_defecto=excluded.simbolo_por_defecto,
          fuente=excluded.fuente,
          fuente_url=excluded.fuente_url,
          sondeo_ms=excluded.sondeo_ms,
          actualizado_en=excluded.actualizado_en
      `).run('local', value.intervalo_por_defecto, value.saldo_inicial, exchange_id, symbol, value.fuente, url, value.sondeo_ms, stamp);
      return row(db.prepare('SELECT * FROM config WHERE id=?'), 'local');
    },
  };
}

