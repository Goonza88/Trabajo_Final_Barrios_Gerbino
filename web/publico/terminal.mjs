// terminal del navegador - interpreta los escapes del sustrato y traduce teclas/mouse a bytes

import { charWidth } from '../../backend/terminal/ansi.mjs';

const VACIO = Object.freeze({});
const celda = (c = ' ', e = VACIO) => ({ c, e });
const CSI = /\x1b\[([?]?)([0-9;]*)([@-~])/y;
const CSI_INCOMPLETA = /^\x1b(\[[?]?[0-9;]*)?$/;

const BASICOS = [ // los 16 colores basicos y la escala de 256
  '#000000', '#cd0000', '#00cd00', '#cdcd00', '#0000ee', '#cd00cd', '#00cdcd', '#e5e5e5',
  '#7f7f7f', '#ff0000', '#00ff00', '#ffff00', '#5c5cff', '#ff00ff', '#00ffff', '#ffffff'
];

function color256(n) {
  if (n < 16) return BASICOS[n];
  if (n >= 232) {
    const gris = 8 + (n - 232) * 10;
    return `rgb(${gris},${gris},${gris})`;
  }
  const nivel = v => v ? 55 + v * 40 : 0;
  const k = n - 16;
  return `rgb(${nivel(Math.floor(k / 36))},${nivel(Math.floor(k / 6) % 6)},${nivel(k % 6)})`;
}

export class Pantalla {
  constructor(cols, rows) {
    this.estilo = VACIO;
    this.mouse = false;
    this.pedidos = [];
    this.resto = '';
    this.redimensionar(cols, rows);
  }

  // cambia tamaño, mantiene lo que entra y deja las filas sucias
  redimensionar(cols, rows) {
    const vieja = this.celdas ?? [];
    this.cols = cols;
    this.rows = rows;
    this.celdas = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => vieja[r]?.[c] ?? celda()));
    this.fila = Math.min(this.fila ?? 0, rows - 1);
    this.col = Math.min(this.col ?? 0, cols - 1);
    this.sucias = new Set(this.celdas.keys());
  }

  // filas cambiadas desde la ultima vez, en orden
  tomarSucias() {
    const filas = [...this.sucias].sort((a, b) => a - b);
    this.sucias.clear();
    return filas;
  }

  // la fila en tramos de texto con el mismo estilo
  tramos(r) {
    const tramos = [];
    for (const { c, e } of this.celdas[r]) {
      const ultimo = tramos.at(-1);
      if (ultimo?.estilo === e) ultimo.texto += c;
      else tramos.push({ texto: c, estilo: e });
    }
    return tramos;
  }

  // pedidos que la app manda a la pagina por OSC, en orden
  tomarPedidos() {
    return this.pedidos.splice(0);
  }

  texto(r) {
    return this.celdas[r].map(({ c }) => c).join('');
  }

  escribir(datos) {
    const s = this.resto + datos;
    this.resto = '';
    let i = 0;
    while (i < s.length) {
      if (s[i] === '\x1b' && s[i + 1] === ']') {
        const fin = s.slice(i).search(/\x07|\x1b\\/);
        if (fin < 0) {
          this.resto = s.slice(i);
          break;
        }
        this.pedidos.push(s.slice(i + 2, i + fin));
        i += fin + (s[i + fin] === '\x07' ? 1 : 2);
        continue;
      }
      if (s[i] === '\x1b') {
        CSI.lastIndex = i;
        const m = CSI.exec(s);
        if (m) {
          this.secuencia(m[1], m[2], m[3]);
          i = CSI.lastIndex;
        } else if (CSI_INCOMPLETA.test(s.slice(i))) {
          this.resto = s.slice(i);
          break;
        } else i += 2;
        continue;
      }
      const cp = s.codePointAt(i);
      i += cp > 0xffff ? 2 : 1;
      if (cp === 0x0d) this.col = 0;
      else if (cp === 0x0a) this.bajar();
      else if (cp === 0x08) this.col = Math.max(0, this.col - 1);
      else if (cp >= 0x20) this.poner(String.fromCodePoint(cp), charWidth(cp));
    }
  }

  // un caracter en el cursor - ancho cero se pega al anterior, anchos ocupan dos celdas
  poner(c, ancho) {
    if (ancho === 0) {
      const previa = this.celdas[this.fila][Math.max(0, this.col - 1)];
      previa.c += c;
      return;
    }
    if (this.col + ancho > this.cols) {
      this.col = 0;
      this.bajar();
    }
    const fila = this.celdas[this.fila];
    fila[this.col] = celda(c, this.estilo);
    if (ancho === 2 && this.col + 1 < this.cols) fila[this.col + 1] = celda('', this.estilo);
    this.sucias.add(this.fila);
    this.col += ancho;
  }

  // baja una fila - en la ultima corre la pantalla
  bajar() {
    if (this.fila < this.rows - 1) return void this.fila++;
    this.celdas.shift();
    this.celdas.push(Array.from({ length: this.cols }, () => celda()));
    this.sucias = new Set(this.celdas.keys());
  }

  borrar(r, desde = 0, hasta = this.cols) {
    for (let c = desde; c < hasta; c++) this.celdas[r][c] = celda();
    this.sucias.add(r);
  }

  secuencia(privada, parametros, final) {
    const p = parametros.split(';').map(n => n === '' ? null : Number(n));
    const mover = (fila, col) => {
      this.fila = Math.min(this.rows - 1, Math.max(0, fila));
      this.col = Math.min(this.cols - 1, Math.max(0, col));
    };
    if (privada) {
      if (final !== 'h' && final !== 'l') return;
      for (const modo of p) {
        if (modo === 1049) for (let r = 0; r < this.rows; r++) this.borrar(r);
        if (modo === 1000 || modo === 1002) this.mouse = final === 'h';
      }
      return;
    }
    if (final === 'H' || final === 'f') mover((p[0] ?? 1) - 1, (p[1] ?? 1) - 1);
    else if (final === 'A') mover(this.fila - (p[0] ?? 1), this.col);
    else if (final === 'B') mover(this.fila + (p[0] ?? 1), this.col);
    else if (final === 'C') mover(this.fila, this.col + (p[0] ?? 1));
    else if (final === 'D') mover(this.fila, this.col - (p[0] ?? 1));
    else if (final === 'K') {
      const modo = p[0] ?? 0;
      this.borrar(this.fila, modo === 0 ? this.col : 0, modo === 1 ? this.col + 1 : this.cols);
    } else if (final === 'J') {
      const modo = p[0] ?? 0;
      if (modo === 0) this.borrar(this.fila, this.col);
      for (let r = 0; r < this.rows; r++) if (modo === 2 || modo === 3 || r > this.fila) this.borrar(r);
    } else if (final === 'm') this.sgr(p);
  }

  // colores y atributos del texto que sigue
  sgr(p) {
    const e = { ...this.estilo };
    for (let i = 0; i < p.length; i++) {
      const n = p[i] ?? 0;
      if (n === 0) for (const k of Object.keys(e)) delete e[k];
      else if (n === 1) e.bold = true;
      else if (n === 2) e.dim = true;
      else if (n === 3) e.italic = true;
      else if (n === 4) e.underline = true;
      else if (n === 7) e.reverse = true;
      else if (n === 22) { delete e.bold; delete e.dim; }
      else if (n === 23) delete e.italic;
      else if (n === 24) delete e.underline;
      else if (n === 27) delete e.reverse;
      else if (n === 39) delete e.fg;
      else if (n === 49) delete e.bg;
      else if (n >= 30 && n <= 37) e.fg = BASICOS[n - 30];
      else if (n >= 40 && n <= 47) e.bg = BASICOS[n - 40];
      else if (n >= 90 && n <= 97) e.fg = BASICOS[n - 82];
      else if (n >= 100 && n <= 107) e.bg = BASICOS[n - 92];
      else if (n === 38 || n === 48) {
        const clave = n === 38 ? 'fg' : 'bg';
        if (p[i + 1] === 5) {
          e[clave] = color256(p[i + 2] ?? 0);
          i += 2;
        } else if (p[i + 1] === 2) {
          e[clave] = `rgb(${p[i + 2] ?? 0},${p[i + 3] ?? 0},${p[i + 4] ?? 0})`;
          i += 4;
        }
      }
    }
    this.estilo = Object.keys(e).length ? Object.freeze(e) : VACIO;
  }
}

// estilo css de un tramo - reverse cambia frente y fondo
export function estiloCss(e, { fg, bg }) {
  const frente = e.fg ?? fg;
  const fondo = e.bg ?? bg;
  const css = {
    color: e.reverse ? fondo : frente,
    background: e.reverse ? frente : fondo,
  };
  if (e.bold) css.fontWeight = 'bold';
  if (e.dim) css.opacity = '0.6';
  if (e.italic) css.fontStyle = 'italic';
  if (e.underline) css.textDecoration = 'underline';
  return css;
}

const TECLAS = {
  Enter: '\r', Backspace: '\x7f', Tab: '\t', Escape: '\x1b',
  ArrowUp: '\x1b[A', ArrowDown: '\x1b[B', ArrowRight: '\x1b[C', ArrowLeft: '\x1b[D',
  Home: '\x1b[H', End: '\x1b[F', Insert: '\x1b[2~', Delete: '\x1b[3~', PageUp: '\x1b[5~', PageDown: '\x1b[6~',
};

// bytes que mandaria una terminal por la tecla - null si la tecla queda para el navegador
export function teclaABytes({ key, ctrlKey, altKey, shiftKey, metaKey }) {
  if (metaKey) return null;
  if (key === 'Tab' && shiftKey) return '\x1b[Z';
  if (TECLAS[key]) return (altKey ? '\x1b' : '') + TECLAS[key];
  if ([...key].length !== 1) return null;
  if (ctrlKey) return /^[a-z]$/i.test(key) ? String.fromCharCode(key.toLowerCase().charCodeAt(0) - 96) : null;
  return (altKey ? '\x1b' : '') + key;
}

// reporte de mouse SGR - boton, columna y fila desde 1, apretado o soltado
export function mouseABytes(boton, col, fila, abajo) {
  return `\x1b[<${boton};${col};${fila}${abajo ? 'M' : 'm'}`;
}