import {
  rows,
  row,
  id,
  now,
  checkSymbol,
  checkOperation,
  attachTags,
  oneWithTags,
  transaction,
  validateFilter,
  OPERATION_SIDES,
  ORDER_TYPES,
  OPERATION_STATES,
  CLOSE_REASONS,
  validateDecimal,
  validateNullableDecimal,
  validateEnum,
  validateText,
  required,
  validateFields,
  validateTags
} from './helpers.mjs';

export function createOperations(db, clock) {
  return {
    registerOperation(value) {
      validateFields(value, ['exchange_id', 'symbol', 'lado', 'tipo', 'cantidad', 'precio_entrada', 'take_profit', 'stop_loss', 'estado', 'fees', 'notas', 'tags']);
      validateEnum(required(value?.lado, 'lado'), 'lado', OPERATION_SIDES);
      validateEnum(required(value?.tipo, 'tipo'), 'tipo', ORDER_TYPES);
      validateDecimal(required(value?.cantidad, 'cantidad'), 'cantidad');
      validateDecimal(required(value?.precio_entrada, 'precio_entrada'), 'precio_entrada');
      const take_profit = validateNullableDecimal(value.take_profit, 'take_profit');
      const stop_loss = validateNullableDecimal(value.stop_loss, 'stop_loss');
      const state = value.estado ?? 'abierta';
      validateEnum(state, 'estado', ['pendiente', 'abierta']);
      const fees = value.fees ?? '0';
      validateDecimal(fees, 'fees');
      const notas = value.notas == null ? null : validateText(value.notas, 'notas');
      const tags = validateTags(value.tags);
      checkSymbol(db, value.exchange_id, value.symbol);
      const createdAt = now(clock, 'creada_en');
      const openedAt = state === 'abierta' ? now(clock, 'abierta_en') : null;
      return transaction(db, () => {
        const result = db.prepare(`
          INSERT INTO operacion (
            exchange_id, symbol, lado, tipo, cantidad, precio_entrada,
            take_profit, stop_loss, precio_salida, fees, creada_en,
            abierta_en, cerrada_en, motivo_cierre, estado, notas
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, ?, ?)
        `).run(
          value.exchange_id,
          value.symbol,
          value.lado,
          value.tipo,
          value.cantidad,
          value.precio_entrada,
          take_profit,
          stop_loss,
          fees,
          createdAt,
          openedAt,
          state,
          notas
        );
        const operationId = Number(result.lastInsertRowid);
        const add = db.prepare(
          'INSERT INTO operacion_tag (operacion_id, tag) VALUES (?, ?)'
        );
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
    activateOperation(operation_id) {
      const current = checkOperation(db, operation_id);
      if (current.estado !== 'pendiente') {
        throw new Error('la operacion no esta pendiente: ' + current.estado);
      }
      db.prepare("UPDATE operacion SET estado='abierta',abierta_en=? WHERE id=?")
        .run(now(clock, 'abierta_en'), operation_id);
      const operation = row(db.prepare('SELECT * FROM operacion WHERE id=?'), operation_id);
      return oneWithTags(db, 'operacion_tag', 'operacion_id', operation);
    },
    closeOperation(operation_id, closing) {
      const current = checkOperation(db, operation_id);
      if (current.estado !== 'abierta') throw new Error('la operacion no esta abierta: ' + current.estado);
      validateFields(closing, ['precio_salida', 'motivo_cierre', 'fees']);
      validateDecimal(required(closing?.precio_salida, 'precio_salida'), 'precio_salida');
      const closeReason = validateEnum(
        required(closing?.motivo_cierre, 'motivo_cierre'),
        'motivo_cierre',
        CLOSE_REASONS
      );
      const fees = closing.fees == null ? current.fees : validateDecimal(closing.fees, 'fees');
      db.prepare("UPDATE operacion SET estado='cerrada',precio_salida=?,motivo_cierre=?,cerrada_en=?,fees=? WHERE id=?")
        .run(closing.precio_salida, closeReason, now(clock), fees, operation_id);
      const operation = row(db.prepare('SELECT * FROM operacion WHERE id=?'), operation_id);
      return oneWithTags(db, 'operacion_tag', 'operacion_id', operation);
    },
    cancelOperation(operation_id) {
      const current = checkOperation(db, operation_id);
      if (current.estado !== 'pendiente' && current.estado !== 'abierta') {
        throw new Error('la operacion no se puede cancelar: ' + current.estado);
      }
      db.prepare("UPDATE operacion SET estado='cancelada',precio_salida=NULL,motivo_cierre=NULL,cerrada_en=? WHERE id=?")
        .run(now(clock), operation_id);
      const operation = row(db.prepare('SELECT * FROM operacion WHERE id=?'), operation_id);
      return oneWithTags(db, 'operacion_tag', 'operacion_id', operation);
    },
    addTag(operation_id, tag) {
      checkOperation(db, operation_id);
      validateText(required(tag, 'tag'), 'tag');
      if (db.prepare('SELECT 1 FROM operacion_tag WHERE operacion_id=? AND tag=?').get(operation_id, tag)) {
        throw new Error('la tag ya esta: ' + tag);
      }
      db.prepare('INSERT INTO operacion_tag (operacion_id, tag) VALUES (?, ?)').run(operation_id, tag);
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
}

