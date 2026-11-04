// arma el grafico de velas como una matriz de celdas para el substrato

import { grid } from '../../backend/terminal/widgets.mjs';
import { anchoEje, anchoPlot, columnaVela, dibujarEscalon, indiceEnColumna, limitarVelas, putText } from './trazos.mjs';
import { dibujarVelas } from './cuerpos.mjs';
import { dibujarNiveles } from './niveles.mjs';

// medidas, velas que entran, series recortadas y escala de precios, compartido por grafico y mira
function prepararGrafico({ velas, vacias = 0, width, height, showAxis, zoomY, offsetY, indicadores }) {
  const totalW = Math.max(1, Math.floor(width));
  const axisW = anchoEje(totalW, showAxis);
  const plotW = anchoPlot(totalW, showAxis);
  const totalH = Math.max(showAxis ? 2 : 1, Math.floor(height));
  const plotH = Math.max(1, totalH - (showAxis ? 1 : 0));
  const visibles = limitarVelas(velas, Math.max(1, plotW - vacias));
  // lugares de vela en el ancho - visibles y vacios a la derecha
  const lugares = visibles.length + vacias;
  const recortar = serie => Array.isArray(serie) ? serie.slice(-visibles.length) : null;
  const smaVisible = recortar(indicadores.sma);
  const emaVisible = recortar(indicadores.ema);
  const bandas = indicadores.bollinger && typeof indicadores.bollinger === 'object'
    ? {
      middle: recortar(indicadores.bollinger.middle),
      upper: recortar(indicadores.bollinger.upper),
      lower: recortar(indicadores.bollinger.lower),
    }
    : null;
  const base = {
    totalW, axisW, plotW, totalH, plotH, velas: visibles, lugares, smaVisible, emaVisible, bandas,
    colForIndex: (i) => columnaVela(i, lugares, plotW),
  };
  if (!visibles.length) return base;

  const zY = Number.isFinite(zoomY) && zoomY > 0 ? zoomY : 1;
  const offY = Number.isFinite(offsetY) ? offsetY : 0;
  const toLog = (v) => {
    const value = Number(v);
    return value > 0 ? Math.log10(value) : NaN;
  };
  const series = [smaVisible, emaVisible, bandas?.upper, bandas?.middle, bandas?.lower].filter(Array.isArray);
  let lmin = Infinity, lmax = -Infinity;
  for (const c of visibles) {
    const lo = toLog(c.low), hi = toLog(c.high);
    if (lo < lmin) lmin = lo;
    if (hi > lmax) lmax = hi;
  }
  for (const serie of series) {
    for (const value of serie) {
      if (value == null || !Number.isFinite(Number(value))) continue;
      const lv = toLog(value);
      if (!Number.isFinite(lv)) continue;
      if (lv < lmin) lmin = lv;
      if (lv > lmax) lmax = lv;
    }
  }
  if (lmin === lmax) { lmin -= 0.002; lmax += 0.002; }
  const span = (lmax - lmin) * zY;
  lmin = lmin - (span - (lmax - lmin)) / 2 + offY;
  lmax = lmin + span;
  if (lmax - lmin < 1e-12) { lmin -= 0.001; lmax += 0.001; }
  const lrange = lmax - lmin;
  const py = (v) => ((lmax - toLog(v)) / lrange) * (plotH - 1);
  const precioEnFila = (fila) => 10 ** (lmax - (fila / Math.max(1, plotH - 1)) * lrange);
  return { ...base, lmin, lmax, lrange, py, precioEnFila };
}

// vela, indice y precio bajo la mira - vela null en lugar vacio, null sin velas o sin mira
export function leerMira({ velas = [], vacias = 0, width, height, showAxis = true, zoomY = 1, offsetY = 0, indicadores = {}, mira = null } = {}) {
  const g = prepararGrafico({ velas, vacias, width, height, showAxis, zoomY, offsetY, indicadores });
  if (!mira || !g.velas.length) return null;
  const fila = Math.max(0, Math.min(g.plotH - 1, mira.row));
  const indice = indiceEnColumna(mira.col - g.axisW, g.lugares, g.plotW);
  return { vela: g.velas[indice] ?? null, indice, lugares: g.lugares, precio: g.precioEnFila(fila) };
}

// mira sobre vela de un indice - en la fila dada o su cierre
export function miraEnVela({ velas = [], vacias = 0, width, height, showAxis = true, zoomY = 1, offsetY = 0, indicadores = {} } = {}, indice, fila = null) {
  const g = prepararGrafico({ velas, vacias, width, height, showAxis, zoomY, offsetY, indicadores });
  if (!g.velas.length) return null;
  const i = Math.max(0, Math.min(g.lugares - 1, indice));
  const row = fila ?? Math.round(g.py(g.velas[Math.min(i, g.velas.length - 1)].close));
  return { col: g.axisW + g.colForIndex(i), row: Math.max(0, Math.min(g.plotH - 1, row)) };
}

function dibujarEscalonCapa(plot, valores, colForIndex, filaParaValor, estilo) {
  const capa = Array.from({ length: plot.length }, () => Array(plot[0]?.length ?? 0).fill(null));
  dibujarEscalon(capa, valores, colForIndex, filaParaValor, estilo);
  for (let row = 0; row < capa.length; row++) {
    for (let col = 0; col < capa[row].length; col++) {
      if (capa[row][col]) plot[row][col] = capa[row][col];
    }
  }
}

export function graficoVelas({
  velas = [],
  vacias = 0,
  width,
  height,
  interval = '1m',
  showAxis = true,
  zoomY = 1,
  offsetY = 0,
  indicadores = {},
  mira = null,
  niveles = [],
} = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError('graficoVelas: faltan width y height');
  }

  const g = prepararGrafico({ velas, vacias, width, height, showAxis, zoomY, offsetY, indicadores });
  const { totalW, axisW, plotW, totalH, plotH, lugares, smaVisible, emaVisible, bandas, colForIndex } = g;
  velas = g.velas;
  const cells = Array.from({ length: totalH }, () => Array(totalW).fill(null));

  if (!velas.length) {
    putText(cells, 0, 0, 'sin velas', { fg: 'sec' });
    return grid({ width: totalW, height: totalH, cells });
  }

  const { lmin, lmax, lrange, py } = g;
  const priceSeries = [
    { values: smaVisible, style: { fg: 'accent' } },
    { values: emaVisible, style: { fg: 'sec' } },
  ].filter(serie => Array.isArray(serie.values));

  const labels = [];

  function fmtTime(ts) {
    const d = new Date(ts);
    if (interval === '1d') return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    if (interval === '4h' || interval === '1h') return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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
    let t = Math.floor(t0 / stepMs) * stepMs;
    while (t <= t1 + stepMs) {
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < velas.length; i++) {
        const d = Math.abs(velas[i].open_time - t);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      if (bestD <= stepMs * 0.6) {
        const c = colForIndex(bestI);
        if (c >= 0 && c < plotW && !labels.some(label => label.i === c)) {
          labels.push({ i: c, t: fmtTime(t) });
        }
      }
      t += stepMs;
    }
  }

  if (labels.length === 0 && velas.length > 1) {
    const mid = Math.floor(velas.length / 2);
    const c = colForIndex(mid);
    labels.push({ i: c, t: fmtTime(velas[mid].open_time) });
  }

  labels.sort((a, b) => a.i - b.i);
  const columnasEtiqueta = new Set(labels.map(l => l.i));

  const plot = Array.from({ length: plotH }, () => Array(plotW).fill(null));
  const bandBackground = Array.from({ length: plotH }, () => Array(plotW).fill(null));

  if (bandas) {
    for (let i = 0; i < velas.length; i++) {
      const upper = Number(bandas.upper?.[i]);
      const middle = Number(bandas.middle?.[i]);
      const lower = Number(bandas.lower?.[i]);
      if (![upper, middle, lower].every(Number.isFinite) || upper <= 0 || middle <= 0 || lower <= 0) continue;

      const col = colForIndex(i);
      if (col < 0 || col >= plotW) continue;
      const upperRow = Math.max(0, Math.min(plotH - 1, Math.floor(py(upper))));
      const middleRow = Math.max(0, Math.min(plotH - 1, Math.round(py(middle))));
      const lowerRow = Math.max(0, Math.min(plotH - 1, Math.ceil(py(lower))));
      const nextCol = i + 1 < velas.length ? colForIndex(i + 1) : col + 1;

      // mantiene los valores de esta vela hasta la siguiente
      for (let fillCol = col; fillCol < nextCol && fillCol < plotW; fillCol++) {
        for (let row = upperRow; row < middleRow; row++) {
          bandBackground[row][fillCol] = 'successBg';
        }
        for (let row = middleRow; row <= lowerRow; row++) {
          bandBackground[row][fillCol] = 'dangerBg';
        }
      }
    }
  }

  dibujarVelas(plot, velas, colForIndex, py);

  for (const serie of priceSeries) {
    dibujarEscalonCapa(plot, serie.values, colForIndex, py, () => serie.style);
  }
  const etiquetasNivel = dibujarNiveles(plot, niveles, py);

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

  // con la mira la grilla se oculta
  const colMira = mira ? colForIndex(indiceEnColumna(mira.col - axisW, lugares, plotW)) : null;
  const filaMira = mira ? Math.max(0, Math.min(plotH - 1, mira.row)) : null;
  const celdaFondo = (r, c) => {
    if (mira) {
      if (c === colMira && r === filaMira) return { ch: '┼', style: { fg: 'muted' } };
      if (c === colMira) return { ch: '╎', style: { fg: 'muted' } };
      if (r === filaMira) return { ch: '╴', style: { fg: 'muted' } };
      return null;
    }
    if (columnasEtiqueta.has(c) || ygrid.has(r)) return { ch: '·', style: { fg: 'muted' } };
    return null;
  };

  for (let r = 0; r < plotH; r++) {
    for (let c = 0; c < plotW; c++) {
      let cell = plot[r][c] ?? celdaFondo(r, c);
      const bg = bandBackground[r][c];
      if (bg) {
        const style = cell?.style && typeof cell.style === 'object' ? { ...cell.style, bg } : { bg };
        cell = cell ? { ...cell, style } : { ch: ' ', style };
      }
      if (cell) cells[r][axisW + c] = cell;
    }
    if (showAxis) {
      const lab = ylabels.get(r) || '';
      putText(cells, r, 0, lab.slice(0, axisW), { fg: 'reader' });
    }
  }
  // el precio de cada nivel reemplaza la etiqueta en su fila
  if (showAxis) {
    for (const { row, texto, style } of etiquetasNivel) putText(cells, row, 0, texto.slice(0, axisW - 1).padEnd(axisW), style);
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
