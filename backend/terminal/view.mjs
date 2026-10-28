// convierte arboles de widgets en lineas pintables - layout por bandas y render por diff

import { escape, palette, toAnsi, textWidth, padRight, truncateTo } from './ansi.mjs';

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
  input: paintInput,
  candlechart: paintCandlechart,
};

const BLOCK8 = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function paintCandlechart(ctx, node, width) {
  const candles = node.candles || [];
  if (!candles.length) {
    ctx.out.push({ content: palette.muted + 'sin velas' + escape.reset, width: textWidth('sin velas') });
    return;
  }
  const h = Math.max(6, node.height || 14);
  const axisW = node.showAxis ? 9 : 0;
  const totalW = (node.width ?? width);
  const w = Math.max(1, totalW - axisW);
  const zoomY = node.zoomY || 1.0;
  const offsetY = node.offsetY || 0;
  const useHalf = node.half !== false;
  const toLog = (v) => Math.log10(Math.max(Number(v), 1e-18));
  let lmin = Infinity, lmax = -Infinity;
  for (const c of candles) {
    const lo = toLog(c.low), hi = toLog(c.high);
    if (lo < lmin) lmin = lo;
    if (hi > lmax) lmax = hi;
  }
  if (lmin === lmax) { lmin -= 0.002; lmax += 0.002; }
  const span = (lmax - lmin) * zoomY;
  lmin = lmin - (span - (lmax - lmin)) / 2 + offsetY;
  lmax = lmin + span;
  if (lmax - lmin < 1e-12) { lmin -= 0.001; lmax += 0.001; }
  const slice = candles;
  if (lmax - lmin < 1e-12) { lmin -= 0.001; lmax += 0.001; }
  const lrange = lmax - lmin || 1;
  function py(v) {
    const p = (lmax - toLog(v)) / lrange;
    return p * (h - 1);
  }
  function y(v) {
    return Math.round(py(v));
  }
  const interval = node.interval || '1m';
  const labels = [];
  const xg = [];

  function colForIndex(i) {
    if (slice.length <= 1) return Math.floor(w / 2);
    return Math.round((i / Math.max(1, slice.length - 1)) * (w - 1));
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    if (interval === '1d') return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    if (interval === '4h') return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    if (interval === '1h') return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  if (slice.length > 1) {
    const t0 = slice[0].open_time;
    const t1 = slice[slice.length - 1].open_time;
    const spanMs = Math.max(1, t1 - t0);
    const steps = [60000, 300000, 900000, 1800000, 3600000, 7200000, 14400000, 21600000, 43200000, 86400000, 172800000, 604800000];
    let stepMs = steps[0];
    let best = Infinity;
    for (let i = 0; i < steps.length; i++) {
      const cnt = spanMs / steps[i];
      const score = Math.abs(cnt - 5.5);
      if (score < best) {
        best = score;
        stepMs = steps[i];
        continue;
      }
      if (cnt >= 4 && cnt <= 7 && score === best) {
        stepMs = steps[i];
      }
    }
    const align = stepMs;
    let t = Math.floor(t0 / align) * align;
    while (t <= t1 + align) {
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < slice.length; i++) {
        const d = Math.abs(slice[i].open_time - t);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      if (bestD <= align * 0.6) {
        const c = colForIndex(bestI);
        if (c >= 0 && c < w && !xg.some(x => Math.abs(x - c) < 1)) {
          xg.push(c);
          labels.push({ i: c, t: fmtTime(t) });
        }
      }
      t += align;
    }
  }

  if (labels.length === 0 && slice.length > 1) {
    const mid = Math.floor(slice.length / 2);
    const c = colForIndex(mid);
    labels.push({ i: c, t: fmtTime(slice[mid].open_time) });
    xg.push(c);
  }

  xg.sort((a,b)=>a-b);
  labels.sort((a,b)=>a.i-b.i);
  node._xlabels = labels.map(l => l.i);
  const xlabelsSet = new Set(node._xlabels);
  const xgridSet = new Set(xg);
  const grid = Array.from({ length: h }, () => Array(w).fill(null));
  const count = slice.length;
  if (useHalf) {
    const sub = 2;
    const h2 = h * sub;
    const covWick = Array.from({ length: h2 }, () => Array(w).fill(0));
    const covBody = Array.from({ length: h2 }, () => Array(w).fill(0));
    function fillInterval(arr, col, p1, p2) {
      if (col < 0 || col >= w) return;
      const minP = Math.min(p1, p2);
      const maxP = Math.max(p1, p2);
      if (maxP < -0.5 || minP > h - 0.5) return;
      for (let sr = 0; sr < h2; sr++) {
        const s0 = sr / sub;
        const s1s = (sr + 1) / sub;
        if (s1s <= minP - 1e-6 || s0 >= maxP + 1e-6) continue;
        const im = Math.max(minP, s0);
        const ix = Math.min(maxP, s1s);
        if (ix <= im) continue;
        const scov = (ix - im) / (s1s - s0);
        if (scov > arr[sr][col]) arr[sr][col] = Math.min(1, scov);
      }
    }
    function fillBody(arr, col, p1, p2) {
      if (col < 0 || col >= w) return;
      const minP = Math.min(p1, p2);
      const maxP = Math.max(p1, p2);
      if (maxP < -0.5 || minP > h - 0.5) return;
      for (let sr = 0; sr < h2; sr++) {
        const s0 = sr / sub;
        const s1s = (sr + 1) / sub;
        if (s1s <= minP - 1e-6 || s0 >= maxP + 1e-6) continue;
        const im = Math.max(minP, s0);
        const ix = Math.min(maxP, s1s);
        if (ix <= im) continue;
        const scov = (ix - im) / (s1s - s0);
        if (scov > arr[sr][col]) arr[sr][col] = Math.min(1, scov);
      }
    }
    for (let i = 0; i < count; i++) {
      const c = slice[i];
      const o = Number(c.open), cl = Number(c.close), lo = Number(c.low), hi = Number(c.high);
      const pH = py(hi), pL = py(lo), pO = py(o), pC = py(cl);
      const up = cl >= o;
      const col = colForIndex(i);
      if (hi > lo) fillInterval(covWick, col, pH, pL);
      else {
        const minP = Math.min(pH,pL);
        fillInterval(covWick, col, Math.max(0, minP - 1e-3), Math.min(h-1, minP + 1e-3));
      }
      if (o !== cl) fillBody(covBody, col, pO, pC);
      else {
        const minP = Math.min(pO,pC);
        fillBody(covBody, col, Math.max(0, minP - 1e-3), Math.min(h-1, minP + 1e-3));
      }
      node._candleUp = node._candleUp || [];
      node._candleUp[i] = up;
      node._candleCol = node._candleCol || [];
      node._candleCol[i] = col;
    }
    node._covWick = covWick;
    node._covBody = covBody;
    node._h2 = h2;
    node._w = w;
    node._h = h;
  } else {
    for (let i = 0; i < count; i++) {
      const c = slice[i];
      const o = Number(c.open), cl = Number(c.close), lo = Number(c.low), hi = Number(c.high);
      const pH = py(hi), pL = py(lo), pO = py(o), pC = py(cl);
      const up = cl >= o;
      const col = colForIndex(i);
      if (hi > lo) {
        const minP = Math.min(pH, pL);
        const maxP = Math.max(pH, pL);
        let r1w = Math.floor(minP);
        let r2w = Math.ceil(maxP);
        if (r2w <= r1w) {
          r1w = Math.floor(minP);
          r2w = r1w + 1;
        }
        r1w = Math.max(0, Math.min(h - 1, r1w));
        r2w = Math.max(0, Math.min(h - 1, r2w));
        if (r2w < r1w) { const tmp = r1w; r1w = r2w; r2w = tmp; }
        for (let r = r1w; r <= r2w; r++) {
          if (grid[r] && col >= 0 && col < w) grid[r][col] = { ch: '|', color: up ? palette.success : palette.danger };
        }
      } else {
        const yM = Math.round((pH + pL) / 2);
        const r = Math.max(0, Math.min(h - 1, yM));
        if (grid[r] && col >= 0 && col < w) grid[r][col] = { ch: '|', color: up ? palette.success : palette.danger };
      }
      if (o !== cl) {
        const minPB = Math.min(pO, pC);
        const maxPB = Math.max(pO, pC);
        let r1b = Math.floor(minPB);
        let r2b = Math.ceil(maxPB);
        if (r2b <= r1b) {
          r1b = Math.floor(minPB);
          r2b = r1b + 1;
        }
        r1b = Math.max(0, Math.min(h - 1, r1b));
        r2b = Math.max(0, Math.min(h - 1, r2b));
        if (r2b < r1b) { const tmp = r1b; r1b = r2b; r2b = tmp; }
        for (let r = r1b; r <= r2b; r++) {
          if (grid[r] && col >= 0 && col < w) grid[r][col] = { ch: '█', color: up ? palette.success : palette.danger };
        }
      } else {
        const yM = Math.round((pO + pC) / 2);
        const r = Math.max(0, Math.min(h - 1, yM));
        if (grid[r] && col >= 0 && col < w) grid[r][col] = { ch: '█', color: up ? palette.success : palette.danger };
      }
    }
  }
  function fmt(v) {
    if (v >= 1000) return v.toFixed(0);
    if (v >= 10) return v.toFixed(1);
    if (v >= 1) return v.toFixed(2);
    return v.toFixed(4);
  }
  function fromLog(l) { return Math.pow(10, l); }

  const ygrid = new Set();
  const ylabels = new Map();
  const spanLog = Math.abs(lmax - lmin);
  let stepLog = 1;
  if (spanLog < 0.012) stepLog = 0.001;
  else if (spanLog < 0.06) stepLog = 0.002;
  else if (spanLog < 0.12) stepLog = 0.005;
  else if (spanLog < 0.25) stepLog = 0.01;
  else if (spanLog < 0.5) stepLog = 0.02;
  else if (spanLog < 0.9) stepLog = 0.05;
  else if (spanLog < 1.5) stepLog = 0.1;
  else if (spanLog < 3) stepLog = 0.25;
  else if (spanLog < 7) stepLog = 0.5;
  else stepLog = 1;
  const startLog = Math.floor(lmin / stepLog) * stepLog;
  for (let lv = startLog; lv <= lmax + stepLog * 2; lv += stepLog) {
    const price = fromLog(lv);
    if (price < 1e-18) continue;
    const p = (lmax - lv) / lrange;
    const r = Math.round(p * (h - 1));
    if (r < -1 || r > h) continue;
    const rr = Math.max(0, Math.min(h - 1, r));
    ygrid.add(rr);
    if (!ylabels.has(rr)) ylabels.set(rr, fmt(price));
  }

  if (useHalf && node._covWick && node._covBody) {
    const covWick = node._covWick;
    const covBody = node._covBody;
    const cc = node._candleCol || [];
    const cu = node._candleUp || [];
    for (let r = 0; r < h; r++) {
      let line = '';
      for (let c = 0; c < w; c++) {
        let colUp = true;
        for (let i = 0; i < cc.length; i++) {
          if (cc[i] === c) { colUp = cu[i]; break; }
        }
        const color = colUp ? palette.success : palette.danger;
        let hasBody = false;
        let hasWick = false;
        for (let sr = 0; sr < 2; sr++) {
          if ((covBody[r * 2 + sr][c] || 0) > 0.01) hasBody = true;
          if ((covWick[r * 2 + sr][c] || 0) > 0.01) hasWick = true;
        }
        if (hasBody) {
          line += color + '█' + escape.reset;
        } else if (hasWick) {
          line += color + '|' + escape.reset;
        } else {
          if (xgridSet.has(c)) {
            if (xlabelsSet.has(c)) line += toAnsi({ fg: '#8ab6bb' }) + '·' + escape.reset;
            else line += escape.fg(0x3a, 0x3a, 0x3a) + '·' + escape.reset;
          } else if (ygrid.has(r)) {
            line += escape.fg(0x3a, 0x3a, 0x3a) + '·' + escape.reset;
          } else {
            line += ' ';
          }
        }
      }
      if (node.showAxis) {
        let lab = ylabels.get(r) || '';
        line = escape.fg(0x66, 0x66, 0x66) + padRight(lab, axisW) + escape.reset + line;
      }
      ctx.out.push({ content: truncateTo(line, totalW), width: Math.min(textWidth(line), totalW) });
    }
  } else {
    for (let r = 0; r < h; r++) {
      let line = '';
      for (let c = 0; c < w; c++) {
        if (grid[r][c]) line += grid[r][c].color + grid[r][c].ch + escape.reset;
        else {
          if (xgridSet.has(c)) {
            if (xlabelsSet.has(c)) line += toAnsi({ fg: '#8ab6bb' }) + '·' + escape.reset;
            else line += escape.fg(0x3a, 0x3a, 0x3a) + '·' + escape.reset;
          } else if (ygrid.has(r)) {
            line += escape.fg(0x3a, 0x3a, 0x3a) + '·' + escape.reset;
          } else {
            line += ' ';
          }
        }
      }
      if (node.showAxis) {
        let lab = ylabels.get(r) || '';
        line = escape.fg(0x66, 0x66, 0x66) + padRight(lab, axisW) + escape.reset + line;
      }
      ctx.out.push({ content: truncateTo(line, totalW), width: Math.min(textWidth(line), totalW) });
    }
  }
  if (node.showAxis && labels.length) {
    let bl = ' '.repeat(axisW);
    for (const lab of labels) {
      const pos = textWidth(bl) - axisW;
      if (pos >= lab.i) continue;
      bl += ' '.repeat(lab.i - pos);
      bl += palette.sec + lab.t + escape.reset;
      if (textWidth(bl) >= totalW) break;
    }
    ctx.out.push({ content: truncateTo(bl, totalW), width: Math.min(textWidth(bl), totalW) });
  }
}

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
    const line = isSelected ? applyBg(cells, toAnsi({ bg: 'selected' })) : cells;
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

// input de una linea - la etiqueta se queda con lo que sobra y el cursor nunca queda afuera
function paintInput(ctx, node, width) {
  const labelW = node.label ? textWidth(node.label) + 1 : 0;
  const total = Math.max(1, Math.min(node.width ?? width, width));
  const fieldW = Math.max(1, total - labelW);
  const empty = !node.value;
  const chars = [...(empty ? node.placeholder : node.value)];
  const caret = node.caret == null ? chars.length : Math.max(0, Math.min(node.caret, chars.length));
  const room = Math.max(1, fieldW - 1); // la ultima columna del campo es del cursor
  const windowAt = (size) => Math.max(0, Math.min(caret - size + 1, chars.length - size));
  const dots = windowAt(room) > 0 && fieldW >= 3; // sin lugar para el texto no van puntos
  const visible = dots ? room - 1 : room;
  const start = windowAt(visible);
  const slice = chars.slice(start, start + visible);
  const at = caret - start + (dots ? 1 : 0);
  let body;
  if (!node.focused) body = (empty ? palette.muted : '') + slice.join('') + escape.reset;
  else if (at < slice.length) body = slice.slice(0, at).join('') + toAnsi({ fg: 'accent', bg: 'reader' }) + slice[at] + escape.reset + slice.slice(at + 1).join('');
  else body = slice.join('') + toAnsi({ bg: 'reader' }) + ' ' + escape.reset;
  const head = (node.label ? node.label + ' ' : '') + (dots ? '…' : '');
  pushStyled(ctx, head + body, '', total);
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