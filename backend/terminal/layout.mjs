// medidas de las cajas - borde, padding y tamano interior en un solo lugar

export const BORDERS = { // simbolos para rectangulo que una caja pide por nombre
  round:  { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  square: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  thick:  { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
};

// normaliza el padding a n | [v,h] | { top, right, bottom, left }
export function normalizePadding(pad) {
  if (pad == null) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof pad === 'number') return { top: pad, right: pad, bottom: pad, left: pad };
  if (Array.isArray(pad)) return { top: pad[0] ?? 0, right: pad[1] ?? 0, bottom: pad[0] ?? 0, left: pad[1] ?? 0 };
  return { top: pad.top ?? 0, right: pad.right ?? 0, bottom: pad.bottom ?? 0, left: pad.left ?? 0 };
}

// resuelve borde, padding y tamano interior de una caja
export function boxSize(node, width) {
  const border = node.border === true ? BORDERS.round
    : typeof node.border === 'string' ? (BORDERS[node.border] ?? BORDERS.round)
    : (node.border && typeof node.border === 'object') ? node.border
    : null;
  const pad = normalizePadding(node.pad);
  const frame = border ? 2 : 0;
  const outerW = Math.max(0, Math.min(node.width ?? width, width));
  const innerW = Math.max(0, outerW - frame - pad.left - pad.right);
  const innerH = node.height != null // sin height, la caja mide lo que mide el contenido
    ? Math.max(0, node.height - frame - pad.top - pad.bottom)
    : null;

  return { border, pad, frame, outerW, innerW, innerH };
}
