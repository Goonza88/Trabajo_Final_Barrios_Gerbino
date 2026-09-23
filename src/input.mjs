// convierte bytes del stdin en eventos decodificando secuencias de escape, flags y estado del mouse

// DECODIFICACION ==================================================================================

// byte de escape y delimitadores de secuencia (CSI/SS3 y el rango del byte final)
const ESC = 0x1b, CSI = 0x5b, SS3 = 0x4f, FINAL_MIN = 0x40, FINAL_MAX = 0x7e;

// tabla de secuencias de escape con su nombre de tecla
const KEYS = {
  '\x1b[A': 'ArrowUp',
  '\x1b[B': 'ArrowDown',
  '\x1b[C': 'ArrowRight',
  '\x1b[D': 'ArrowLeft',
  '\x1b[H': 'Home',
  '\x1b[F': 'End',
  '\x1b[Z': 'ShiftTab',
  '\x1b[2~': 'Insert',
  '\x1b[3~': 'Delete',
  '\x1b[5~': 'PageUp',
  '\x1b[6~': 'PageDown',
  '\x1bOA': 'ArrowUp',
  '\x1bOB': 'ArrowDown',
  '\x1bOC': 'ArrowRight',
  '\x1bOD': 'ArrowLeft',
  '\x1bOH': 'Home',
  '\x1bOF': 'End',
};

// teclas de navegacion con modificador (CSI <n>;<mod><final>)
const FINALS = { A: 'ArrowUp', B: 'ArrowDown', C: 'ArrowRight', D: 'ArrowLeft', H: 'Home', F: 'End' };
const TILDES = { 2: 'Insert', 3: 'Delete', 5: 'PageUp', 6: 'PageDown' };

// desarma el numero de modificadores que envia xterm en flags (shift/alt/ctrl)
function modFlags(mod) {
  const mask = (Number(mod) || 1) - 1;
  return { shift: !!(mask & 1), alt: !!(mask & 2), ctrl: !!(mask & 4) };
}

// arma un evento de tecla con nombre y flags de modificadores
function keyEvent(name, mod = {}) {
  return { type: 'key', key: name, shift: false, alt: false, ctrl: false, ...mod };
}

// decodifica una secuencia completa: teclas por tabla, mouse SGR y variantes con mod
function decodeSeq(seq) {
  const text = seq.toString('utf8');
  const hit = KEYS[text];
  if (hit) return [keyEvent(hit, { shift: hit === 'ShiftTab' })];
  const sgr = text.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (sgr) return [{ type: 'mouse', btn: +sgr[1], col: +sgr[2], row: +sgr[3], down: sgr[4] === 'M' }];
  const mod = text.match(/^\x1b\[(\d+);(\d+)([A-Z~])$/);
  if (mod) {
    const num = +mod[1];
    const name = mod[3] === '~' ? TILDES[num] : (num === 1 ? FINALS[mod[3]] : null);
    return name ? [keyEvent(name, modFlags(mod[2]))] : [keyEvent('Esc')];
  }
  // lo que no matcheo antes (Esc+byte => Alt+<tecla>) - CSI desconocida => Esc
  if (text[1] !== '[') return [keyEvent('Alt+' + text.slice(1)[0], { alt: true })];
  return [keyEvent('Esc')];
}

// convierte texto plano en teclas: Enter, Tab, Backspace y Ctrl+<letra>
function decodeText(str) {
  const out = [];
  for (const char of str) {
    const codePoint = char.codePointAt(0);
    if (codePoint === 0x03) out.push(keyEvent('Ctrl+c', { ctrl: true }));
    else if (codePoint === 0x0d || codePoint === 0x0a) out.push(keyEvent('Enter'));
    else if (codePoint === 0x09) out.push(keyEvent('Tab'));
    else if (codePoint === 0x7f || codePoint === 0x08) out.push(keyEvent('Backspace'));
    else if (codePoint < 0x20) out.push(keyEvent('Ctrl+' + String.fromCharCode(codePoint + 96), { ctrl: true }));
    else out.push(keyEvent(char));
  }
  return out;
}

// bytes que faltan al buffer para completar el ultimo caracter UTF-8
export function utf8Pending(buf) {
  let i = buf.length - 1;
  let continuations = 0;
  while (i >= 0 && (buf[i] & 0xc0) === 0x80) { continuations++; i--; } // continuaciones
  if (i < 0) return 0;
  const lead = buf[i];
  let expect; // esperar si nos quedamos cortos del total
  if ((lead & 0xe0) === 0xc0) expect = 2;
  else if ((lead & 0xf0) === 0xe0) expect = 3;
  else if ((lead & 0xf8) === 0xf0) expect = 4;
  else return 0;
  return (1 + continuations) < expect ? buf.length - i : 0;
}

// largo de la secuencia en buf[i] - 0 si falta el byte final (queda pendiente)
function seqLen(buf, i) {
  if (i + 1 >= buf.length) return 0;
  if (buf[i + 1] === CSI || buf[i + 1] === SS3) {
    for (let k = i + 2; k < buf.length; k++) {
      if (FINAL_MIN <= buf[k] && buf[k] <= FINAL_MAX) return k - i + 1;
    }
    return 0;
  }
  return 2;
}

// parte un buffer en texto + secuencias y las decodifica, devuelve { events, pending } con lo incompleto
function scan(buf) {
  const events = [];
  let i = 0;
  while (i < buf.length) {
    if (buf[i] === ESC) {
      const len = seqLen(buf, i);
      if (len === 0) return { events, pending: Buffer.from(buf.subarray(i)) };
      events.push(...decodeSeq(buf.subarray(i, i + len)));
      i += len;
    } else {
      const j = buf.indexOf(ESC, i);
      const end = j === -1 ? buf.length : j;
      events.push(...decodeText(buf.toString('utf8', i, end)));
      i = end;
    }
  }
  return { events, pending: null };
}

// REARMADO DE CHUNKS ==============================================================================

// junta los chunks y emite eventos normalizados de teclado/mouse
export class Dispatcher {
  constructor() {
    this.pendingBytes = null;  // caracter UTF-8 que llego cortado en un chunk
    this.pendingEsc   = null;  // secuencia de escape incompleta pendiente
    this.escTimer     = null;  // timer de 30ms para el Esc suelto
    this.mouse        = { active: false, btn: null, col: 0, row: 0 };
  }

  // procesa un chunk juntando lo pendiente y emitiendo los eventos completados
  onData(chunk, emit) {
    let buf = Buffer.from(chunk);
    // byte nuevo cancela el timer, re-juntado puede completar la secuencia pendiente
    if (this.pendingEsc) {
      clearTimeout(this.escTimer);
      this.escTimer = null;
      buf = Buffer.concat([this.pendingEsc, buf]);
      this.pendingEsc = null;
    }
    if (this.pendingBytes) {
      buf = Buffer.concat([this.pendingBytes, buf]);
      this.pendingBytes = null;
    }
    const pendingUtf8 = utf8Pending(buf);
    if (pendingUtf8 > 0) {
      this.pendingBytes = Buffer.from(buf.subarray(buf.length - pendingUtf8));
      buf = buf.subarray(0, buf.length - pendingUtf8);
      if (!buf.length) return;
    }
    const { events, pending } = scan(buf);
    if (pending) this.holdEscape(pending, emit);
    for (const event of events) { try { emit(this.trackMouse(event)); } catch {} }
  }

  // retiene Esc al final del buffer, espera 30ms y emite suelto si no llega otra tecla
  holdEscape(pending, emit) {
    if (this.escTimer) clearTimeout(this.escTimer);
    this.pendingEsc = pending;
    this.escTimer = setTimeout(() => {
      if (!this.pendingEsc) return;
      this.pendingEsc = null;
      this.escTimer = null;
      try { emit(keyEvent('Esc')); } catch {}
    }, 30);
  }

  // convierte reporte SGR en fases (down/up/drag/move/scroll)
  trackMouse(event) {
    if (!event || event.type !== 'mouse') return event;
    const { btn, col, row } = event;
    if (btn >= 64 && btn <= 67) {
      return { ...event, phase: 'scroll', dx: btn === 66 ? -1 : btn === 67 ? 1 : 0, dy: btn === 64 ? -1 : btn === 65 ? 1 : 0 };
    }
    if (btn >= 32 && btn < 64) {
      if (this.mouse.active) {
        return { ...event, btn: this.mouse.btn, phase: 'drag', dx: col - this.mouse.col, dy: row - this.mouse.row };
      }
      return { ...event, btn: 0, phase: 'move', dx: 0, dy: 0 };
    }
    if (event.down) {
      this.mouse.active = true;
      this.mouse.btn = btn;
      this.mouse.col = col;
      this.mouse.row = row;
      return { ...event, phase: 'down', dx: 0, dy: 0 };
    }
    const rel = { ...event, phase: 'up', dx: col - this.mouse.col, dy: row - this.mouse.row };
    this.mouse.active = false;
    this.mouse.btn = null;
    return rel;
  }

  // suelta los pendientes y cancela el timer de Esc
  destroy() {
    if (this.escTimer) clearTimeout(this.escTimer);
    this.pendingEsc = null;
    this.escTimer = null;
    this.pendingBytes = null;
    this.mouse = { active: false, btn: null, col: 0, row: 0 };
  }
}

// EDICION =========================================================================================

// edicion de texto simple, los caracteres agregan y Backspace borra
export function editText(current, keyName) {
  if (keyName === 'Backspace' || keyName === 'Ctrl+h') return { value: [...current].slice(0, -1).join(''), handled: true };
  if (keyName && keyName.length === 1 && keyName.codePointAt(0) >= 0x20) return { value: current + keyName, handled: true };
  return { value: current, handled: false };
}