// maneja teclas de escape, paleta de colores y medicion unicode para layouts

// ESCAPES =========================================================================================

// vocabulario de escapes - cada propiedad es una orden especifica que podemos disparar
export const escape = {
  reset: '\x1b[0m',
  hide: '\x1b[?25l',
  show: '\x1b[?25h',
  clearScreen: '\x1b[2J',
  home: '\x1b[H',
  eraseRight: '\x1b[K',
  eraseBelow: '\x1b[J',
  enter: '\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h',
  leave: '\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l',
  fg(red, green, blue) { return `\x1b[38;2;${red};${green};${blue}m`; },
  bg(red, green, blue) { return `\x1b[48;2;${red};${green};${blue}m`; },
  goto(row, col = 1) { return `\x1b[${row};${col}H`; },
};

// convierte un estilo (obj o string) en los escapes ANSI que lo pintan
export function toAnsi(style) {
  if (!style) return '';
  if (typeof style === 'string') return style;
  const color = (value, background) => {
    if (typeof value === 'number') return background ? `\x1b[48;5;${value}m` : `\x1b[38;5;${value}m`;
    if (typeof value === 'string' && value[0] === '#') {
      const num = parseInt(value.slice(1), 16);
      return background
        ? escape.bg((num >> 16) & 255, (num >> 8) & 255, num & 255)
        : escape.fg((num >> 16) & 255, (num >> 8) & 255, num & 255);
    }
    if (typeof value === 'string' && value in raw) {
      const [red, green, blue] = raw[value];
      return background ? escape.bg(red, green, blue) : escape.fg(red, green, blue);
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

// COLOR ===========================================================================================

// fondo de la fila seleccionada
export const selectedBg = escape.bg(0x25, 0x27, 0x27);

// paleta de colores por rol (para la UI)
export const palette = {
  text:    escape.fg(0xaa, 0xab, 0xac),
  accent:  escape.fg(0x98, 0x6c, 0x98),
  sec:     escape.fg(0x8a, 0xb6, 0xbb),
  danger:  escape.fg(0x98, 0x59, 0x54),
  muted:   escape.fg(0x88, 0x88, 0x88),
  reader:  escape.fg(0x66, 0x66, 0x66),
  success: escape.fg(0x6f, 0xac, 0x67),
};

// paleta de colores crudos para permitir variantes
const raw = {
  text:    [0xaa, 0xab, 0xac],
  accent:  [0x98, 0x6c, 0x98],
  sec:     [0x8a, 0xb6, 0xbb],
  danger:  [0x98, 0x59, 0x54],
  muted:   [0x88, 0x88, 0x88],
  reader:  [0x66, 0x66, 0x66],
  success: [0x6f, 0xac, 0x67],
};

// LIMPIEZA ========================================================================================

// limpia texto para mostrarlo sin los codigos ANSI
export function sanitize(str) {
  return String(str)
    .replace(ANSI, '')
    .replace(/[\x00-\x08\x0a-\x1f\x7f-\x9f]/g, '')
    .replace(/\t/g, '  ');
}

// MEDICION ========================================================================================

// ancho visible de un code point (segun tipo de alfabeto unicode)
export function charWidth(codePoint) {
  if (codePoint === 0x200d || codePoint === 0xfe0f) return 0;
  if (0x0300 <= codePoint && codePoint <= 0x036f) return 0;
  const wide = (0x1100 <= codePoint && codePoint <= 0x115f)
    || (0x2e80  <= codePoint && codePoint <= 0xa4cf && codePoint !== 0x303f)
    || (0xac00  <= codePoint && codePoint <= 0xd7a3)
    || (0xf900  <= codePoint && codePoint <= 0xfaff)
    || (0xfe30  <= codePoint && codePoint <= 0xfe6f)
    || (0xff00  <= codePoint && codePoint <= 0xff60)
    || (0x1f300 <= codePoint && codePoint <= 0x1f64f)
    || (0x20000 <= codePoint && codePoint <= 0x3fffd);
  return wide ? 2 : 1;
}

// ancho visible de un string en celdas de la terminal (sin contar escapes)
export function textWidth(str) {
  let width = 0;
  for (const char of String(str).replace(ANSI, '')) width += charWidth(char.codePointAt(0));
  return width;
}

// FORMATO =========================================================================================

// rellena a la derecha para alinear con otras columnas o filas
export function padRight(str, width) {
  const used = textWidth(str);
  return used >= width ? String(str) : String(str) + ' '.repeat(width - used);
}

// corta una linea a un ancho especifico para no heredar colores
export function truncateTo(str, width) {
  const text = String(str);
  let out = '', used = 0, i = 0;
  while (i < text.length && used < width) {
    if (text[i] === '\x1b') {
      const match = ANSI.exec(text.slice(i));
      if (match && match.index === 0) { out += match[0]; i += match[0].length; continue; }
    }
    const charW = charWidth(text.codePointAt(i));
    if (used + charW > width) break;
    out += String.fromCodePoint(text.codePointAt(i));
    used += charW;
    i += charW === 2 && text.codePointAt(i) > 0xffff ? 2 : 1;
  }
  if (i < text.length && /\x1b\[/.test(out)) out += escape.reset;
  return out;
}

// corta una linea a un ancho especifico agregando puntos suspensivos
export function ellipse(str, width, dots = '...') {
  return textWidth(str) <= width ? String(str) : truncateTo(str, Math.max(0, width - textWidth(dots))) + dots;
}