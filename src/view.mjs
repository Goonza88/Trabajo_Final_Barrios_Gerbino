// view: convierte arboles de widgets en lineas pintables - layout por bandas y render por diff

import { escape, palette, selectedBg, toAnsi, textWidth, padRight, truncateTo } from './ansi.mjs';

export const BORDERS = { // simbolos para rectangulo que una caja pide por nombre
  round:  { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
  square: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
  thick:  { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
  double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
};

// BANDAS ==========================================================================================

// reparte el total en bandas - fijas pasan tal cual, nulls comparten sobrante
function computeBands(sizes, count, total, gap) {
  const usable = Math.max(0, total - gap * Math.max(0, count - 1));
  const requested = [];
  let flex = 0;
  for (let i = 0; i < count; i++) {
    const size = sizes && sizes[i];
    requested[i] = size == null ? null : Math.max(0, Math.floor(size));
    if (requested[i] == null) flex++;
  }
  const bands = [];
  let placed = 0;
  for (let i = 0; i < count; i++) {
    if (requested[i] == null) { bands[i] = null; continue; }
    bands[i] = Math.min(requested[i], Math.max(0, usable - placed - flex));
    placed += bands[i];
  }
  const leftover = Math.max(0, usable - placed);
  const base = flex ? Math.floor(leftover / flex) : 0;
  let carry = flex ? leftover - base * flex : 0;
  for (let i = 0; i < count; i++) {
    if (bands[i] == null) { bands[i] = base + (carry > 0 ? 1 : 0); if (carry > 0) carry--; }
  }
  return bands;
}

// indice de la banda que toca una col o fila
export function paneIndexAt(sizes, total, gap, pos) {
  const count = sizes ? sizes.length : 0;
  if (!count) return -1;
  const bands = computeBands(sizes, count, total, gap);
  let edge = 0;
  for (let i = 0; i < count; i++) {
    edge += bands[i];
    if (pos < edge) return i;
    edge += i < count - 1 ? gap : 0;
  }
  return count - 1;
}

// RECORRIDO =======================================================================================

// convierte arbol en la lista final de lineas
export function flatten(node, width, height = Infinity) {
  if (width == null) throw new TypeError('view.flatten: falta el width a usar');
  const maxRows = height == null || height === Infinity ? Infinity : Math.max(1, Math.floor(height));
  const ctx = { out: [], maxRows };
  emitNode(ctx, node, width);
  return maxRows === Infinity ? ctx.out : ctx.out.slice(0, maxRows);
}

// dispatch: cada tipo de nodo se pinta con su widget
const WIDGETS = {
  text: paintText,
  gap: (ctx, node) => { for (let i = 0; i < (node.h || 1); i++) ctx.out.push({ content: '', width: 0 }); },
  rows: (ctx, node, w) => { for (const child of node.children) emitNode(ctx, child, w); },
  cols: paintCols,
  split: paintSplit,
  box: paintBox,
  table: paintTable,
  bar: (ctx, node, w) => pushStyled(ctx, barLine(node, w), '', w),
};

// emite un nodo en el buffer o lanza si el tipo es desconocido
function emitNode(ctx, node, w) {
  if (node == null) return;
  const widget = WIDGETS[node.type];
  if (!widget) throw new TypeError('view.flatten: tipo de nodo desconocido: ' + node.type);
  widget(ctx, node, w);
}

// FORMATO =========================================================================================

// aplica el estilo y trunca el contenido antes de empujar al buffer
function pushStyled(ctx, content, style, w) {
  const styled = toAnsi(style) + truncateTo(content, w) + (style ? escape.reset : '');
  ctx.out.push({ content: styled, width: Math.min(textWidth(content), w) });
}

// barra de porcentaje con corchetes dentro de un ancho
function progressBar(percent, width) {
  const clamped = Math.max(0, Math.min(1, percent));
  const filled = Math.round(clamped * (width - 2));
  return palette.accent + '[' + escape.reset
    + palette.success + '█'.repeat(Math.max(0, filled)) + escape.reset
    + palette.reader + '─'.repeat(Math.max(0, width - 2 - filled)) + escape.reset
    + palette.accent + ']' + escape.reset;
}

// linea de una barra - "etiqueta [###----] valor"
function barLine(node, width) {
  const inner = node.width || Math.max(4, width - textWidth(node.label) - textWidth(node.value) - 2);
  return node.label + ' ' + progressBar(node.percent, inner) + (node.value ? ' ' + node.value : '');
}

// alinea (izq, centro, der) el contenido en el ancho disponible
function padAlign(content, contentW, targetW, align) {
  const slack = Math.max(0, targetW - contentW);
  if (slack === 0) return content;
  if (align === 'right') return ' '.repeat(slack) + content;
  if (align === 'center') {
    const left = Math.floor(slack / 2);
    return ' '.repeat(left) + content + ' '.repeat(slack - left);
  }
  return content + ' '.repeat(slack);
}

// rearma el fondo despues de cada reset, o vuelve al original
function applyBg(content, bg) {
  if (!bg) return content;
  return bg + content.replaceAll(escape.reset, escape.reset + bg) + escape.reset;
}

// normaliza el padding a n | [v,h] | { top, right, bottom, left }
function normalizePadding(pad) {
  if (pad == null) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof pad === 'number') return { top: pad, right: pad, bottom: pad, left: pad };
  if (Array.isArray(pad)) return { top: pad[0] ?? 0, right: pad[1] ?? 0, bottom: pad[0] ?? 0, left: pad[1] ?? 0 };
  return { top: pad.top ?? 0, right: pad.right ?? 0, bottom: pad.bottom ?? 0, left: pad.left ?? 0 };
}

// PINTADO =========================================================================================

// pinta el texto aplicando estilo
function paintText(ctx, node, w) {
  const style = node.style || '';
  for (const line of String(node.content).split('\n')) pushStyled(ctx, line, style, w);
}

// dibuja la caja - borde, padding, align y valign
function paintBox(ctx, node, width) {
  const borderSet = node.border === true ? BORDERS.round
    : typeof node.border === 'string' ? (BORDERS[node.border] ?? BORDERS.round)
    : (node.border && typeof node.border === 'object') ? node.border
    : null;
  const pad = normalizePadding(node.pad);
  const outerW = Math.max(0, Math.min(node.width ?? width, width));
  const frame = borderSet ? 2 : 0;
  const innerW = Math.max(0, outerW - frame - pad.left - pad.right);
  const innerH = node.height != null // sin height, la caja mide lo que mide el contenido
    ? Math.max(0, node.height - frame - pad.top - pad.bottom)
    : null;

  let lines = flatten(node.child, innerW, innerH ?? Infinity);
  if (innerH != null) {
    if (lines.length > innerH) lines = lines.slice(0, innerH);
    else if (lines.length < innerH) {
      const slack = innerH - lines.length;
      const before = node.valign === 'middle' ? Math.floor(slack / 2) : node.valign === 'bottom' ? slack : 0;
      const blank = { content: '', width: 0 };
      lines = [
        ...Array.from({ length: before }, () => blank),
        ...lines,
        ...Array.from({ length: slack - before }, () => blank),
      ];
    }
  }

  const bgCode = node.bg ? toAnsi({ bg: node.bg }) : '';
  const contentStyle = node.style ? toAnsi(node.style) : '';
  const borderCode = node.borderStyle ? toAnsi(node.borderStyle) : '';
  const edge = (l, r) => borderCode + l + borderSet.h.repeat(Math.max(0, outerW - 2)) + r + (borderCode ? escape.reset : '');
  const top = borderSet && edge(borderSet.tl, borderSet.tr);
  const bottom = borderSet && edge(borderSet.bl, borderSet.br);
  const padRow = ' '.repeat(innerW);

  const boxLine = (inner, contentW) => {
    const body = padAlign(inner, contentW, innerW, node.align || 'left');
    const withPad = ' '.repeat(pad.left) + body + ' '.repeat(pad.right);
    const painted = applyBg(contentStyle ? contentStyle + withPad + escape.reset : withPad, bgCode);
    const line = borderSet ? borderCode + borderSet.v + (borderCode ? escape.reset : '') + painted + borderCode + borderSet.v + (borderCode ? escape.reset : '') : painted;
    ctx.out.push({ content: line, width: outerW });
  };

  if (top) ctx.out.push({ content: top, width: outerW });
  for (let i = 0; i < pad.top; i++) boxLine(padRow, innerW);
  for (const line of lines) boxLine(truncateTo(line.content, innerW), line.width);
  for (let i = 0; i < pad.bottom; i++) boxLine(padRow, innerW);
  if (bottom) ctx.out.push({ content: bottom, width: outerW });
}

// junta los hijos lado a lado respetando widths
function paintCols(ctx, node, width) {
  const gapW = node.gap ?? 1;
  const panes = (node.children || []).map(child => flatten(child, width));
  const height = Math.max(0, ...panes.map(list => list.length));
  const fixed = node.widths || [];
  for (let row = 0; row < height; row++) {
    const parts = [];
    let rowW = 0;
    for (let i = 0; i < panes.length; i++) {
      const line = panes[i][row] || { content: '', width: 0 };
      let segment = line.content;
      if (fixed[i] != null) {
        if (line.width >= fixed[i]) segment = truncateTo(segment, fixed[i]);
        else segment = segment + ' '.repeat(fixed[i] - line.width);
        rowW += fixed[i];
      } else {
        rowW += line.width;
      }
      parts.push(segment);
    }
    const joined = parts.join(' '.repeat(gapW));
    ctx.out.push({ content: truncateTo(joined, width), width: Math.min(rowW + gapW * Math.max(0, parts.length - 1), width) });
  }
}

// pinta header y filas, resalta la fila seleccionada
function paintTable(ctx, node, width) {
  const rowsArr = node.rows || [];
  const colCount = Math.max(node.headers?.length || 0, rowsArr[0]?.length || 0);
  if (!colCount) return;
  const colWidths = []; // ancho = maximo contenido que tiene
  if (node.headers) for (let col = 0; col < colCount; col++) colWidths[col] = textWidth(String(node.headers[col] ?? ''));
  for (const row of rowsArr) {
    for (let col = 0; col < colCount; col++) {
      const cell = row && col < row.length ? row[col] : null;
      colWidths[col] = Math.max(colWidths[col] || 0, textWidth(String(cell ?? '')));
    }
  }
  const gapW = 1;
  const header = node.headers ? node.headers.map((head, col) => padRight(String(head), colWidths[col])).join(' '.repeat(gapW)) : '';
  if (header) pushStyled(ctx, header, palette.muted, width);
  for (let row = 0; row < rowsArr.length; row++) {
    const cells = rowsArr[row].map((cell, col) => padRight(String(cell ?? ''), colWidths[col])).join(' '.repeat(gapW));
    const isSelected = node.cursor != null && row === node.cursor;
    const line = isSelected ? applyBg(cells, selectedBg) : cells;
    ctx.out.push({ content: truncateTo(line, width), width: Math.min(textWidth(cells), width) });
  }
}

// pinta las bandas de sus hijos (h o v)
function paintSplit(ctx, node, width) {
  const children = node.children || [];
  if (!children.length) return;
  const gapW = node.gap ?? 1;
  if (node.dir === 'v') {
    const sizes = computeBands(node.sizes, children.length, ctx.maxRows, gapW);
    for (let i = 0; i < children.length; i++) {
      const lines = flatten(children[i], width, sizes[i]);
      for (const line of lines) ctx.out.push(line);
      if (Number.isFinite(sizes[i])) {
        for (let row = lines.length; row < sizes[i]; row++) ctx.out.push({ content: '', width: 0 });
      }
      if (i < children.length - 1 && gapW > 0) ctx.out.push({ content: '', width: 0 });
    }
    return;
  }
  const sizes = computeBands(node.sizes, children.length, width, gapW);
  const panes = children.map((child, i) => flatten(child, sizes[i], ctx.maxRows));
  const maxH = Number.isFinite(ctx.maxRows) ? ctx.maxRows : Math.max(0, ...panes.map(list => list.length));
  for (let row = 0; row < maxH; row++) {
    const parts = [];
    let rowW = 0;
    for (let i = 0; i < panes.length; i++) {
      const line = panes[i][row] || { content: '', width: 0 };
      parts.push(line.content + ' '.repeat(Math.max(0, sizes[i] - line.width)));
      rowW += sizes[i];
    }
    const joined = parts.join(' '.repeat(gapW));
    ctx.out.push({ content: truncateTo(joined, width), width: Math.min(rowW + gapW * Math.max(0, parts.length - 1), width) });
  }
}

// RENDER ==========================================================================================

// indices de las lineas que cambiaron entre frames
export function diffLines(prev, next) {
  const max = Math.max(prev.length, next.length);
  const changes = [];
  for (let i = 0; i < max; i++) {
    if (prev[i]?.content !== next[i]?.content) changes.push(i);
  }
  return changes;
}

// texto ANSI - repinta solo las lineas cambiadas
export function frameOutput(changes, lines) {
  let out = '';
  for (const index of changes) {
    out += escape.goto(index + 1, 1) + escape.eraseRight + (lines[index]?.content ?? '') + escape.reset;
  }
  return out;
}