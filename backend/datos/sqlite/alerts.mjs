import {
  rows,
  row,
  id,
  now,
  checkSymbol,
  checkAlert,
  validateFilter,
  INTERVALS,
  ALERT_OPERATORS,
  validateDecimal,
  validateBoolean,
  validateEnum,
  validateText,
  validateNullableText,
  required,
  validateFields,
  validateTypeField
} from './helpers.mjs';

export function createAlerts(db, clock) {
  return {
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
}

