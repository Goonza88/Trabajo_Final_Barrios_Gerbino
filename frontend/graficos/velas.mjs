// arma el grafico de velas como una matriz de celdas para el substrato

import { grid } from '../../backend/terminal/widgets.mjs';

// bloques por octavos para puntas de cuerpos de velas
const BLOCK8 = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

// lineas verticales cortadas para las mechas
const HALF_UP = '╵';
const HALF_DOWN = '╷';

export function anchoPlot(width, showAxis = true) {
  const totalW = Math.max(1, Math.floor(width));
  const axisW = showAxis ? Math.min(9, Math.max(0, totalW - 1)) : 0;
  return Math.max(1, totalW - axisW);
}

export function limitarVelas(velas, capacidad) {
  const max = Math.max(1, Math.floor(capacidad));
  return velas.length > max ? velas.slice(-max) : velas;
}

// escribe texto en una fila de celdas, un caracter por columna
function putText(cells, row, col, text, style) {
  const line = cells[row];
  if (!line) return;
  let c = col;
  for (const ch of String(text)) {
    if (c >= line.length) break;
    if (c >= 0) line[c] = style ? { ch, style } : { ch };
    c++;
  }
}

export function graficoVelas({
  velas = [],
  width,
  height,
  interval = '1m',
  showAxis = true,
  zoomY = 1,
  offsetY = 0,
} = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError('graficoVelas: faltan width y height');
  }

  const totalW = Math.max(1, Math.floor(width));
  const axisW = showAxis ? Math.min(9, Math.max(0, totalW - 1)) : 0;
  const plotW = anchoPlot(totalW, showAxis);
  const totalH = Math.max(showAxis ? 2 : 1, Math.floor(height));
  const plotH = Math.max(1, totalH - (showAxis ? 1 : 0));
  const cells = Array.from({ length: totalH }, () => Array(totalW).fill(null));
  velas = limitarVelas(velas, plotW);

  if (!velas.length) {
    putText(cells, 0, 0, 'sin velas', { fg: 'muted' });
    return grid({ width: totalW, height: totalH, cells });
  }

  const zY = Number.isFinite(zoomY) && zoomY > 0 ? zoomY : 1;
  const offY = Number.isFinite(offsetY) ? offsetY : 0;
  const toLog = (v) => Math.log10(Math.max(Number(v), 1e-18));
  let lmin = Infinity, lmax = -Infinity;
  for (const c of velas) {
    const lo = toLog(c.low), hi = toLog(c.high);
    if (lo < lmin) lmin = lo;
    if (hi > lmax) lmax = hi;
  }
  if (lmin === lmax) { lmin -= 0.002; lmax += 0.002; }
  const span = (lmax - lmin) * zY;
  lmin = lmin - (span - (lmax - lmin)) / 2 + offY;
  lmax = lmin + span;
  if (lmax - lmin < 1e-12) { lmin -= 0.001; lmax += 0.001; }
  const lrange = lmax - lmin || 1;
  const py = (v) => ((lmax - toLog(v)) / lrange) * (plotH - 1);
  const colForIndex = (i) => {
    if (velas.length <= 1) return Math.floor(plotW / 2);
    return Math.round((i / Math.max(1, velas.length - 1)) * (plotW - 1));
  };

  const labels = [];
  const xg = [];

  function fmtTime(ts) {
    const d = new Date(ts);
    if (interval === '1d') return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    if (interval === '4h') return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    if (interval === '1h') return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  if (velas.length > 1) {
    const t0 = velas[0].open_time;
    const t1 = velas[velas.length - 1].open_time;
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
      for (let i = 0; i < velas.length; i++) {
        const d = Math.abs(velas[i].open_time - t);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      if (bestD <= align * 0.6) {
        const c = colForIndex(bestI);
        if (c >= 0 && c < plotW && !xg.some(x => Math.abs(x - c) < 1)) {
          xg.push(c);
          labels.push({ i: c, t: fmtTime(t) });
        }
      }
      t += align;
    }
  }

  if (labels.length === 0 && velas.length > 1) {
    const mid = Math.floor(velas.length / 2);
    const c = colForIndex(mid);
    labels.push({ i: c, t: fmtTime(velas[mid].open_time) });
    xg.push(c);
  }

  xg.sort((a, b) => a - b);
  labels.sort((a, b) => a.i - b.i);
  const xlabelsSet = new Set(labels.map(l => l.i));
  const xgridSet = new Set(xg);

  const plot = Array.from({ length: plotH }, () => Array(plotW).fill(null));

  // filas de la grilla (0..plotH-1) cubren bandas continuas [r-0.5, r+0.5)
  function rowsCovered(p1, p2) {
    const minP = Math.min(p1, p2);
    const maxP = Math.max(p1, p2);
    if (maxP <= -0.5 || minP >= plotH - 0.5) return [];
    const rows = [];
    for (let r = 0; r < plotH; r++) {
      const ov = Math.min(maxP, r + 0.5) - Math.max(minP, r - 0.5);
      if (ov > 1e-9) rows.push(r);
    }
    if (!rows.length) rows.push(Math.max(0, Math.min(plotH - 1, Math.round((minP + maxP) / 2))));
    return rows;
  }

  for (let i = 0; i < velas.length; i++) {
    const c = velas[i];
    const o = Number(c.open), cl = Number(c.close), lo = Number(c.low), hi = Number(c.high);
    const role = cl >= o ? 'success' : 'danger';
    const style = { fg: role };
    const col = colForIndex(i);
    if (col < 0 || col >= plotW) continue;
    const pH = py(hi), pL = py(lo), pO = py(o), pC = py(cl);
    const wickRows = rowsCovered(pH, pL);
    const bodyRows = rowsCovered(pO, pC);
    const bodySet = new Set(bodyRows);
    for (const r of wickRows) {
      if (plot[r]) plot[r][col] = { ch: '|', style };
    }
    for (const r of bodyRows) {
      if (plot[r]) plot[r][col] = { ch: '█', style };
    }
    // puntas por octavos, mechas por mitades
    if (wickRows.length > 1) {
      const top = wickRows[0];
      if (pH > -0.5 && pH < plotH - 0.5) {
        const f = Math.min(1, Math.max(0, top + 0.5 - pH));
        if (bodySet.has(top)) {
          const k = Math.max(1, Math.min(8, Math.round(f * 8)));
          plot[top][col] = k >= 8 ? { ch: '█', style } : { ch: BLOCK8[k], style };
        } else if (f < 0.75) {
          plot[top][col] = { ch: HALF_DOWN, style };
        }
      }
      const bottom = wickRows[wickRows.length - 1];
      if (pL > -0.5 && pL < plotH - 0.5) {
        const u = Math.min(1, Math.max(0, pL - (bottom - 0.5)));
        if (bodySet.has(bottom)) {
          const k = Math.max(1, Math.min(8, Math.round(u * 8)));
          plot[bottom][col] = k >= 8 ? { ch: '█', style }
            : { ch: BLOCK8[8 - k], style: { fg: role, reverse: true } };
        } else if (u < 0.75) {
          plot[bottom][col] = { ch: HALF_UP, style };
        }
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
    const r = Math.round(p * (plotH - 1));
    if (r < -1 || r > plotH) continue;
    const rr = Math.max(0, Math.min(plotH - 1, r));
    ygrid.add(rr);
    if (!ylabels.has(rr)) ylabels.set(rr, fmt(price));
  }

  for (let r = 0; r < plotH; r++) {
    for (let c = 0; c < plotW; c++) {
      let cell = plot[r][c];
      if (!cell) {
        if (xgridSet.has(c)) cell = { ch: '·', style: { fg: xlabelsSet.has(c) ? 'sec' : 'reader' } };
        else if (ygrid.has(r)) cell = { ch: '·', style: { fg: 'reader' } };
      }
      if (cell) cells[r][axisW + c] = cell;
    }
    if (showAxis) {
      const lab = ylabels.get(r) || '';
      putText(cells, r, 0, lab.slice(0, axisW), { fg: 'reader' });
    }
  }

  if (showAxis && labels.length) {
    const row = totalH - 1;
    let cursor = axisW;
    for (const lab of labels) {
      const start = axisW + lab.i;
      const labelW = [...lab.t].length;
      if (start < cursor) continue;
      if (start + labelW > totalW) break;
      putText(cells, row, start, lab.t, { fg: 'sec' });
      cursor = start + labelW;
    }
  }

  return grid({ width: totalW, height: totalH, cells });
}
