// capa de terminal: teclas de escape, paleta de colores y medicion unicode para layouts
// las terminales interpretan ordenes usando texto que comienza con ESC y que no se muestra
// varias utilidades quedan sin uso por ahora, seran consumidas por el renderer/layout

// vocabulario de escapes - cada propiedad es una orden especifica que podemos disparar
export const term = {
  reset: '\x1b[0m',
  hide: '\x1b[?25l',
  show: '\x1b[?25h',
  cls: '\x1b[2J',
  home: '\x1b[H',
  eol: '\x1b[K',
  ed: '\x1b[J',
  enter: '\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h',
  leave: '\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l',
  fg(r, g, b) { return `\x1b[38;2;${r};${g};${b}m`; },
  bg(r, g, b) { return `\x1b[48;2;${r};${g};${b}m`; },
  goto(row, col = 1) { return `\x1b[${row};${col}H`; },
};

// convierte un estilo (obj o string) en los escapes ANSI que lo pintan
export function styleToAnsi(style) {
  if (!style) return '';
  if (typeof style === 'string') return style;
  const color = (c, bg) => {
    if (typeof c === 'number') return bg ? `\x1b[48;5;${c}m` : `\x1b[38;5;${c}m`;
    if (typeof c === 'string' && c[0] === '#') {
      const n = parseInt(c.slice(1), 16);
      return bg ? term.bg((n >> 16) & 255, (n >> 8) & 255, n & 255) : term.fg((n >> 16) & 255, (n >> 8) & 255, n & 255);
    }
    if (typeof c === 'string' && c in RGB) {
      const [r, g, b] = RGB[c];
      return bg ? term.bg(r, g, b) : term.fg(r, g, b);
    }
    return '';
  };
  let out = '';
  if (style.fg) out += color(style.fg, false);
  if (style.bg) out += color(style.bg, true);
  if (style.bold) out += '\x1b[1m';
  if (style.dim) out += '\x1b[2m';
  if (style.italic) out += '\x1b[3m';
  if (style.underline) out += '\x1b[4m';
  return out;
}

const ANSI = /\x1b\[[0-9;?]*[a-zA-Z]/g;

// COLOR -----------------------------------------------------------------------

// fondo de la fila seleccionada
export const selectedBg = term.bg(0x25, 0x27, 0x27);

// paleta de colores por rol (para la UI)
export const palette = {
  text:    term.fg(0xaa, 0xab, 0xac),
  accent:  term.fg(0x98, 0x6c, 0x98),
  sec:     term.fg(0x8a, 0xb6, 0xbb),
  danger:  term.fg(0x98, 0x59, 0x54),
  muted:   term.fg(0x88, 0x88, 0x88),
  reader:  term.fg(0x66, 0x66, 0x66),
  success: term.fg(0x6f, 0xac, 0x67),
};

// paleta de colores crudos para permitir variantes
const RGB = {
  text:    [0xaa, 0xab, 0xac],
  accent:  [0x98, 0x6c, 0x98],
  sec:     [0x8a, 0xb6, 0xbb],
  danger:  [0x98, 0x59, 0x54],
  muted:   [0x88, 0x88, 0x88],
  reader:  [0x66, 0x66, 0x66],
  success: [0x6f, 0xac, 0x67],
};

// LIMPIEZA --------------------------------------------------------------------

// limpia texto para mostrarlo sin los codigos ANSI
export function sanitize(s) {
  return String(s)
    .replace(ANSI, '')
    .replace(/[\x00-\x08\x0a-\x1f\x7f-\x9f]/g, '')
    .replace(/\t/g, '  ');
}

// MEDICION --------------------------------------------------------------------

// ancho visible de un code point (segun tipo de alfabeto unicode)
export function charWidth(cp) {
  if (cp === 0x200d || cp === 0xfe0f) return 0;
  if (0x0300 <= cp && cp <= 0x036f) return 0;
  const wide = (0x1100 <= cp && cp <= 0x115f)
    || (0x2e80  <= cp && cp <= 0xa4cf && cp !== 0x303f)
    || (0xac00  <= cp && cp <= 0xd7a3)
    || (0xf900  <= cp && cp <= 0xfaff)
    || (0xfe30  <= cp && cp <= 0xfe6f)
    || (0xff00  <= cp && cp <= 0xff60)
    || (0x1f300 <= cp && cp <= 0x1f64f)
    || (0x20000 <= cp && cp <= 0x3fffd);
  return wide ? 2 : 1;
}

// ancho visible de un string en celdas de la terminal (sin contar escapes)
export function textWidth(s) {
  let w = 0;
  for (const ch of String(s).replace(ANSI, '')) w += charWidth(ch.codePointAt(0));
  return w;
}

// FORMATO ---------------------------------------------------------------------

// rellena a la derecha para alinear con otras columnas o filas
export function padRight(s, w) {
  const n = textWidth(s);
  return n >= w ? String(s) : String(s) + ' '.repeat(w - n);
}

// corta una linea a un ancho especifico para no heredar colores
export function truncateTo(s, w) {
  const str = String(s);
  let out = '', vis = 0, i = 0;
  while (i < str.length && vis < w) {
    if (str[i] === '\x1b') {
      const m = ANSI.exec(str.slice(i));
      if (m && m.index === 0) { out += m[0]; i += m[0].length; continue; }
    }
    const cw = charWidth(str.codePointAt(i));
    if (vis + cw > w) break;
    out += String.fromCodePoint(str.codePointAt(i));
    vis += cw;
    i += cw === 2 && str.codePointAt(i) > 0xffff ? 2 : 1;
  }
  if (i < str.length && /\x1b\[/.test(out)) out += term.reset;
  return out;
}

// corta una linea a un ancho especifico agregando puntos suspensivos
export function ellipsize(s, w, ell = '...') {
  const str = String(s);
  return textWidth(str) <= w ? str : truncateTo(str, Math.max(0, w - textWidth(ell))) + ell;
}