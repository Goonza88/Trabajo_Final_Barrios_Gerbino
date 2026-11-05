import {
  rows,
  row,
  id,
  now,
  checkSymbol,
  checkNote,
  attachTags,
  oneWithTags,
  transaction,
  validateFilter,
  validateText,
  required,
  validateFields,
  validateTags
} from './helpers.mjs';

export function createNotes(db, clock) {
  return {
    createNote(value) {
      validateFields(value, ['exchange_id', 'symbol', 'titulo', 'cuerpo', 'tags']);
      const exchange_id = value.exchange_id ?? null;
      const symbol = value.symbol ?? null;
      if ((exchange_id == null) !== (symbol == null)) {
        throw new Error('exchange_id y symbol van juntos');
      }
      if (exchange_id != null) {
        checkSymbol(db, exchange_id, symbol);
      }
      validateText(required(value?.titulo, 'titulo'), 'titulo');
      validateText(required(value?.cuerpo, 'cuerpo'), 'cuerpo');
      const tags = validateTags(value.tags);
      const stamp = now(clock, 'created_at');
      return transaction(db, () => {
        const result = db.prepare(`
          INSERT INTO nota (
            exchange_id, symbol, titulo, cuerpo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(exchange_id, symbol, value.titulo, value.cuerpo, stamp, stamp);
        const noteId = Number(result.lastInsertRowid);
        const add = db.prepare('INSERT INTO nota_tag (nota_id, tag) VALUES (?, ?)');
        for (const tag of tags) add.run(noteId, tag);
        const note = row(db.prepare('SELECT * FROM nota WHERE id=?'), noteId);
        return oneWithTags(db, 'nota_tag', 'nota_id', note);
      });
    },
    listNotes(filter = {}) {
      validateFilter(filter, ['exchange_id', 'symbol', 'busqueda']);
      if (filter.exchange_id != null) validateText(filter.exchange_id, 'exchange_id');
      if (filter.symbol != null) validateText(filter.symbol, 'symbol');
      if (filter.busqueda != null) validateText(filter.busqueda, 'busqueda');
      let sql = 'SELECT * FROM nota WHERE 1=1';
      const args = [];
      if (filter.exchange_id != null) {
        sql += ' AND exchange_id=?';
        args.push(filter.exchange_id);
      }
      if (filter.symbol != null) {
        sql += ' AND symbol=?';
        args.push(filter.symbol);
      }
      const records = rows(db.prepare(sql + ' ORDER BY id'), ...args);
      if (filter.busqueda != null) {
        const busqueda = filter.busqueda.toLocaleLowerCase('es');
        const matchingNotes = records.filter(note =>
          note.titulo.toLocaleLowerCase('es').includes(busqueda) ||
          note.cuerpo.toLocaleLowerCase('es').includes(busqueda)
        );
        return attachTags(db, 'nota_tag', 'nota_id', matchingNotes);
      }
      return attachTags(db, 'nota_tag', 'nota_id', records);
    },
    editNote(note_id, changes) {
      const current = checkNote(db, note_id);
      validateFields(changes, ['exchange_id', 'symbol', 'titulo', 'cuerpo']);
      const merged = { ...current, ...changes };
      if ((merged.exchange_id == null) !== (merged.symbol == null)) {
        throw new Error('exchange_id y symbol van juntos');
      }
      if (merged.exchange_id != null) {
        checkSymbol(db, merged.exchange_id, merged.symbol);
      }
      validateText(merged.titulo, 'titulo');
      validateText(merged.cuerpo, 'cuerpo');
      db.prepare('UPDATE nota SET exchange_id=?,symbol=?,titulo=?,cuerpo=?,updated_at=? WHERE id=?').run(merged.exchange_id ?? null, merged.symbol ?? null, merged.titulo, merged.cuerpo, now(clock), note_id);
      const note = row(db.prepare('SELECT * FROM nota WHERE id=?'), note_id);
      return oneWithTags(db, 'nota_tag', 'nota_id', note);
    },
    deleteNote(note_id) {
      checkNote(db, note_id);
      db.prepare('DELETE FROM nota WHERE id=?').run(note_id);
    },
    addTag(note_id, tag) {
      checkNote(db, note_id);
      validateText(required(tag, 'tag'), 'tag');
      if (db.prepare('SELECT 1 FROM nota_tag WHERE nota_id=? AND tag=?').get(note_id, tag)) {
        throw new Error('la tag ya esta: ' + tag);
      }
      db.prepare('INSERT INTO nota_tag (nota_id, tag) VALUES (?, ?)').run(note_id, tag);
      return rows(db.prepare('SELECT tag FROM nota_tag WHERE nota_id=? ORDER BY tag'), note_id)
        .map(value => value.tag);
    },
    removeTag(note_id, tag) {
      checkNote(db, note_id);
      validateText(required(tag, 'tag'), 'tag');
      if (!db.prepare('SELECT 1 FROM nota_tag WHERE nota_id=? AND tag=?').get(note_id, tag)) {
        throw new Error('la tag no existe: ' + tag);
      }
      db.prepare('DELETE FROM nota_tag WHERE nota_id=? AND tag=?').run(note_id, tag);
      return rows(db.prepare('SELECT tag FROM nota_tag WHERE nota_id=? ORDER BY tag'), note_id)
        .map(value => value.tag);
    },
  };
}

