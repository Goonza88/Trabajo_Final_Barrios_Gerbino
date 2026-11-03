// arma el grafico de velas como una matriz de celdas para el substrato

import { grid, table } from '../../backend/terminal/widgets.mjs';

// bloques por octavos para puntas de cuerpos de velas
const BLOCK8 = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

// lineas verticales cortadas para las mechas
const HALF_UP = '╵';
const HALF_DOWN = '╷';

// columnas del eje de precios a la izquierda del grafico
function anchoEje(totalW, showAxis) {
  return showAxis ? Math.min(9, Math.max(0, totalW - 1)) : 0;
}

export function anchoPlot(width, showAxis = true) {
  const totalW = Math.max(1, Math.floor(width));
  return Math.max(1, totalW - anchoEje(totalW, showAxis));
}

// las mismas velas en una tabla, la mas reciente arriba
export function tablaVelas(velas) {
  const filas = velas.slice().reverse().map(v => [
    new Date(v.open_time).toLocaleTimeString('es-AR'),
    v.open,
    v.high,
    v.low,
    v.close,
    v.volume
  ]);
  return table({ headers: ['hora', 'open', 'high', 'low', 'close', 'vol'], rows: filas, fill: true, align: 'center' });
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

function tieneValores(valores) {
  return Array.isArray(valores) && valores.some(valor => valor != null && Number.isFinite(Number(valor)));
}

function celdaLinea(plot, row, col, ch, style) {
  if (plot[row] && col >= 0 && col < plot[row].length) {
    plot[row][col] = { ch, style };
  }
}

function dibujarEscalon(plot, valores, colForIndex, filaParaValor, style) {
  let anterior = null;
  for (let i = 0; i < valores.length; i++) {
    if (valores[i] == null) {
      anterior = null;
      continue;
    }
    const value = Number(valores[i]);
    if (!Number.isFinite(value)) {
      anterior = null;
      continue;
    }

    const col = colForIndex(i);
    const position = filaParaValor(value);
    if (!Number.isFinite(position)) {
      anterior = null;
      continue;
    }
    const row = Math.max(0, Math.min(plot.length - 1, Math.round(position)));
    if (!anterior) {
      celdaLinea(plot, row, col, '─', style);
      anterior = { row, col };
      continue;
    }

    for (let x = anterior.col; x < col; x++) celdaLinea(plot, anterior.row, x, '─', style);
    if (row === anterior.row) {
      celdaLinea(plot, row, col, '─', style);
    } else {
      const arriba = Math.min(row, anterior.row);
      const abajo = Math.max(row, anterior.row);
      for (let y = arriba + 1; y < abajo; y++) celdaLinea(plot, y, col, '│', style);
      const baja = row > anterior.row;
      celdaLinea(plot, anterior.row, col, baja ? '┐' : '┘', style);
      celdaLinea(plot, row, col, baja ? '└' : '┌', style);
    }
    anterior = { row, col };
  }
}

function dibujarEscalonCapa(plot, valores, colForIndex, filaParaValor, style) {
  const capa = Array.from({ length: plot.length }, () => Array(plot[0]?.length ?? 0).fill(null));
  dibujarEscalon(capa, valores, colForIndex, filaParaValor, style);
  for (let row = 0; row < capa.length; row++) {
    for (let col = 0; col < capa[row].length; col++) {
      if (capa[row][col]) plot[row][col] = capa[row][col];
    }
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
  indicadores = {},
} = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError('graficoVelas: faltan width y height');
  }

  const totalW = Math.max(1, Math.floor(width));
  const axisW = anchoEje(totalW, showAxis);
  const plotW = anchoPlot(totalW, showAxis);
  const totalH = Math.max(showAxis ? 2 : 1, Math.floor(height));
  const timeAxisH = showAxis ? 1 : 0;
  const tienePaneInferior = Array.isArray(indicadores.rsi) || Array.isArray(indicadores.volume);
  const maxPaneH = Math.max(0, totalH - timeAxisH - 1);
  const paneDeseado = Math.min(9, Math.max(4, Math.floor(totalH * 0.4)));
  const paneH = tienePaneInferior && maxPaneH >= 2 ? Math.min(maxPaneH, paneDeseado) : 0;
  const panePlotH = paneH > 0 ? paneH - 1 : 0;
  const plotH = Math.max(1, totalH - timeAxisH - paneH);
  const cells = Array.from({ length: totalH }, () => Array(totalW).fill(null));
  const seriesVisibles = serie => Array.isArray(serie) ? serie.slice(-velas.length) : null;
  velas = limitarVelas(velas, plotW);
  const smaVisible = seriesVisibles(indicadores.sma);
  const emaVisible = seriesVisibles(indicadores.ema);
  const rsiVisible = seriesVisibles(indicadores.rsi);
  const volumeVisible = seriesVisibles(indicadores.volume);
  const bandas = indicadores.bollinger && typeof indicadores.bollinger === 'object'
    ? {
      middle: seriesVisibles(indicadores.bollinger.middle),
      upper: seriesVisibles(indicadores.bollinger.upper),
      lower: seriesVisibles(indicadores.bollinger.lower),
    }
    : null;

  if (!velas.length) {
    putText(cells, 0, 0, 'sin velas', { fg: 'muted' });
    return grid({ width: totalW, height: totalH, cells });
  }

  const zY = Number.isFinite(zoomY) && zoomY > 0 ? zoomY : 1;
  const offY = Number.isFinite(offsetY) ? offsetY : 0;
  const toLog = (v) => {
    const value = Number(v);
    return value > 0 ? Math.log10(value) : NaN;
  };
  const priceSeries = [
    { values: smaVisible, style: { fg: 'accent' } },
    { values: emaVisible, style: { fg: 'sec' } },
  ].filter(serie => Array.isArray(serie.values));
  const priceScaleSeries = [
    ...priceSeries.map(serie => serie.values),
    bandas?.upper,
    bandas?.middle,
    bandas?.lower,
  ].filter(Array.isArray);
  let lmin = Infinity, lmax = -Infinity;
  for (const c of velas) {
    const lo = toLog(c.low), hi = toLog(c.high);
    if (lo < lmin) lmin = lo;
    if (hi > lmax) lmax = hi;
  }
  for (const serie of priceScaleSeries) {
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
  const colForIndex = (i) => {
    if (velas.length <= 1) return Math.floor(plotW / 2);
    return Math.round((i / Math.max(1, velas.length - 1)) * (plotW - 1));
  };

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

  // bordes del cuerpo por octavos - q es la posicion del borde dentro de la fila
  function bloqueArriba(q, style) {
    if (q <= 0) return null;
    if (q >= 8) return { ch: '█', style };
    return { ch: BLOCK8[8 - q], style: { ...style, reverse: true } };
  }

  function bloqueAbajo(q, style) {
    if (q >= 8) return null;
    if (q <= 0) return { ch: '█', style };
    return { ch: BLOCK8[8 - q], style };
  }

  function bordeSuperior(celda) {
    const rowTop = celda.row - 0.5;
    if (celda.ch === '█') return rowTop;
    const k = BLOCK8.indexOf(celda.ch);
    return celda.style?.reverse ? rowTop : rowTop + (8 - k) / 8;
  }

  function bordeInferior(celda) {
    const rowTop = celda.row - 0.5;
    if (celda.ch === '█') return rowTop + 1;
    const k = BLOCK8.indexOf(celda.ch);
    return celda.style?.reverse ? rowTop + (8 - k) / 8 : rowTop + 1;
  }

  function errorCuerpo(top, bottom, yTop, yBottom) {
    return (top - yTop) ** 2 + (bottom - yBottom) ** 2;
  }

  function estadoCuerpo(top, bottom, celdas, yTop, yBottom, alcista) {
    return {
      top,
      bottom,
      open: alcista ? bottom : top,
      close: alcista ? top : bottom,
      celdas,
      local: errorCuerpo(top, bottom, yTop, yBottom),
    };
  }

  // una o dos formas para dibujar el cuerpo, segun si entra en una fila o no
  function estadosCuerpo(pO, pC, style) {
    const yTop = Math.min(pO, pC);
    const yBottom = Math.max(pO, pC);
    const alcista = pC <= pO;
    const vacio = [{ top: NaN, bottom: NaN, open: NaN, close: NaN, celdas: [], local: 0 }];
    if (!Number.isFinite(yTop) || !Number.isFinite(yBottom)) return vacio;
    if (yBottom < -0.5 || yTop > plotH - 0.5) return vacio;

    if (yBottom - yTop <= 1e-9) {
      // doji - marca en el octavo mas cercano, borde en el precio
      const row = Math.max(0, Math.min(plotH - 1, Math.floor(yTop + 0.5)));
      const rowTop = row - 0.5;
      const q = Math.max(1, Math.min(7, Math.round((yTop - rowTop) * 8)));
      const borde = rowTop + q / 8;
      const celda = q <= 4 ? bloqueArriba(q, style) : bloqueAbajo(q, style);
      return [estadoCuerpo(
        borde,
        borde,
        celda ? [{ row, ...celda }] : [],
        yTop,
        yBottom,
        alcista
      )];
    }

    const first = Math.max(0, Math.floor(yTop + 0.5));
    const last = Math.min(plotH - 1, Math.floor(yBottom + 0.5));
    if (first > last) return vacio;
    const rowTop = first - 0.5;
    const rowBottom = first + 0.5;

    if (first === last && yTop > rowTop + 1e-9 && yBottom < rowBottom - 1e-9) {
      const qT = Math.max(1, Math.min(7, Math.round((yTop - rowTop) * 8)));
      const qB = Math.max(1, Math.min(7, Math.round((yBottom - rowTop) * 8)));
      const topArriba = rowTop + qT / 8;
      const bottomAbajo = rowTop + qB / 8;
      const celdaArriba = bloqueAbajo(qT, style);
      const celdaAbajo = bloqueArriba(qB, style);
      return [
        estadoCuerpo(
          topArriba,
          rowBottom,
          celdaArriba ? [{ row: first, ...celdaArriba }] : [],
          yTop,
          yBottom,
          alcista
        ),
        estadoCuerpo(
          rowTop,
          bottomAbajo,
          celdaAbajo ? [{ row: first, ...celdaAbajo }] : [],
          yTop,
          yBottom,
          alcista
        ),
      ];
    }

    if (first === last) {
      const filaTop = first - 0.5;
      const filaBottom = first + 0.5;
      const arribaDentro = yTop > filaTop + 1e-9;
      const abajoDentro = yBottom < filaBottom - 1e-9;
      const qT = arribaDentro
        ? Math.max(0, Math.min(7, Math.round((yTop - filaTop) * 8)))
        : 0;
      const qB = abajoDentro
        ? Math.max(1, Math.min(8, Math.round((yBottom - filaTop) * 8)))
        : 8;
      const celda = arribaDentro
        ? bloqueAbajo(qT, style)
        : abajoDentro ? bloqueArriba(qB, style) : { ch: '█', style };
      if (!celda) return vacio;
      return [estadoCuerpo(
        bordeSuperior({ row: first, ...celda }),
        bordeInferior({ row: first, ...celda }),
        [{ row: first, ...celda }],
        yTop,
        yBottom,
        alcista
      )];
    }

    const capTop = first - 0.5;
    const capBottom = last - 0.5;
    const qT0 = yTop > capTop + 1e-9
      ? Math.max(0, Math.min(8, Math.round((yTop - capTop) * 8)))
      : 0;
    const qB0 = yBottom < capBottom + 1 - 1e-9
      ? Math.max(0, Math.min(8, Math.round((yBottom - capBottom) * 8)))
      : 8;

    // en borde que cae sobre limite de fila, el DP elije cual dibujar
    const opcionesT = qT0 === 0 ? [0, 1] : qT0 === 8 ? [8, 7] : [qT0];
    const opcionesB = qB0 === 0 ? [0, 1] : qB0 === 8 ? [8, 7] : [qB0];
    const estados = [];
    for (const qT of opcionesT) {
      for (const qB of opcionesB) {
        const celdas = [];
        if (qT === 0) {
          celdas.push({ row: first, ch: '█', style });
        } else if (qT < 8) {
          const celda = bloqueAbajo(qT, style);
          if (celda) celdas.push({ row: first, ...celda });
        }
        for (let r = first + 1; r < last; r++) {
          celdas.push({ row: r, ch: '█', style });
        }
        if (qB === 8) {
          celdas.push({ row: last, ch: '█', style });
        } else if (qB > 0) {
          const celda = bloqueArriba(qB, style);
          if (celda) celdas.push({ row: last, ...celda });
        }
        if (!celdas.length) continue;
        estados.push(estadoCuerpo(
          capTop + qT / 8,
          capBottom + qB / 8,
          celdas,
          yTop,
          yBottom,
          alcista
        ));
      }
    }
    if (estados.length) return estados;

    // cuerpo mas delgado que un octavo justo sobre un limite de fila
    const medio = (yTop + yBottom) / 2;
    const row = Math.max(0, Math.min(plotH - 1, Math.floor(medio + 0.5)));
    const filaTopMarca = row - 0.5;
    const q = Math.max(1, Math.min(7, Math.round((medio - filaTopMarca) * 8)));
    const borde = filaTopMarca + q / 8;
    const celda = q <= 4 ? bloqueArriba(q, style) : bloqueAbajo(q, style);
    return [estadoCuerpo(
      borde,
      borde,
      celda ? [{ row, ...celda }] : [],
      yTop,
      yBottom,
      alcista
    )];
  }

  function mismoPrecio(a, b) {
    const x = Number(a), y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return Math.abs(x - y) <= Math.max(1e-9, Math.max(Math.abs(x), Math.abs(y)) * 1e-9);
  }

  // elige la variante que mejor coincide con cierre/apertura de velas vecinas
  function elegirCuerpos(cuerpos) {
    const n = cuerpos.length;
    if (!n) return [];
    const PESO_LOCAL = 1e-6;
    const PESO_EMPALME = 4;
    const dp = Array.from({ length: n }, () => []);
    const desde = Array.from({ length: n }, () => []);
    for (let s = 0; s < cuerpos[0].estados.length; s++) {
      dp[0][s] = cuerpos[0].estados[s].local * PESO_LOCAL;
    }
    for (let i = 1; i < n; i++) {
      const estados = cuerpos[i].estados;
      const anteriores = cuerpos[i - 1].estados;
      const comparte = mismoPrecio(velas[i - 1]?.close, velas[i]?.open);
      for (let s = 0; s < estados.length; s++) {
        let mejor = Infinity;
        let mejorPrev = 0;
        for (let p = 0; p < anteriores.length; p++) {
          const base = dp[i - 1][p];
          if (!Number.isFinite(base)) continue;
          const a = anteriores[p];
          const b = estados[s];
          const empalme = comparte && Number.isFinite(a.close) && Number.isFinite(b.open)
            ? (a.close - b.open) ** 2 * PESO_EMPALME
            : 0;
          const costo = base + empalme;
          if (costo < mejor) {
            mejor = costo;
            mejorPrev = p;
          }
        }
        dp[i][s] = mejor + estados[s].local * PESO_LOCAL;
        desde[i][s] = mejorPrev;
      }
    }
    let elegido = 0;
    for (let s = 1; s < dp[n - 1].length; s++) {
      if (dp[n - 1][s] < dp[n - 1][elegido]) elegido = s;
    }
    const eleccion = Array(n);
    eleccion[n - 1] = elegido;
    for (let i = n - 1; i > 0; i--) eleccion[i - 1] = desde[i][eleccion[i]];
    return eleccion;
  }

  const cuerpos = velas.map((c, i) => {
    const o = Number(c.open), cl = Number(c.close);
    const col = colForIndex(i);
    const style = { fg: cl >= o ? 'success' : 'danger' };
    if (col < 0 || col >= plotW) {
      return { col, style, estados: [{ top: NaN, bottom: NaN, open: NaN, close: NaN, celdas: [], local: 0 }] };
    }
    return { col, style, estados: estadosCuerpo(py(o), py(cl), style) };
  });
  const eleccion = elegirCuerpos(cuerpos);

  for (let i = 0; i < velas.length; i++) {
    const c = velas[i];
    const o = Number(c.open), cl = Number(c.close), lo = Number(c.low), hi = Number(c.high);
    const { col, style } = cuerpos[i];
    if (col < 0 || col >= plotW) continue;
    const pH = py(hi), pL = py(lo);
    const wickRows = rowsCovered(pH, pL);
    for (const r of wickRows) {
      if (plot[r]) plot[r][col] = { ch: '|', style };
    }
    // puntas por octavos, mechas por mitades
    if (wickRows.length > 1) {
      const top = wickRows[0];
      if (pH > -0.5 && pH < plotH - 0.5) {
        const f = Math.min(1, Math.max(0, top + 0.5 - pH));
        if (f < 0.75) plot[top][col] = { ch: HALF_DOWN, style };
      }
      const bottom = wickRows[wickRows.length - 1];
      if (pL > -0.5 && pL < plotH - 0.5) {
        const u = Math.min(1, Math.max(0, pL - (bottom - 0.5)));
        if (u < 0.75) plot[bottom][col] = { ch: HALF_UP, style };
      }
    }
    // el cuerpo se pinta al final para que su borde no lo pise la mecha
    const estado = cuerpos[i].estados[eleccion[i]];
    for (const celda of estado.celdas) {
      if (plot[celda.row]) plot[celda.row][col] = { ch: celda.ch, style: celda.style };
    }
  }

  for (const serie of priceSeries) {
    dibujarEscalonCapa(plot, serie.values, colForIndex, py, serie.style);
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
        if (columnasEtiqueta.has(c)) cell = { ch: '·', style: { fg: 'sec' } };
        else if (ygrid.has(r)) cell = { ch: '·', style: { fg: 'reader' } };
      }
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

  if (paneH > 0) {
    const titleRow = plotH;
    const panePlotStart = titleRow + 1;
    const paneLabels = [];
    if (Array.isArray(rsiVisible)) paneLabels.push('RSI 0-100');
    if (Array.isArray(volumeVisible)) paneLabels.push('VOL % max');
    putText(cells, titleRow, 0, paneLabels.join(' | '), { fg: 'muted' });

    const volumenes = (volumeVisible ?? []).filter(value => value != null && Number.isFinite(Number(value))).map(Number);
    const maxVolume = Math.max(0, ...volumenes);
    const hasRsi = Array.isArray(rsiVisible);
    const hasVolume = Array.isArray(volumeVisible);
    const separaEscalas = hasRsi && hasVolume;
    const rsiHeight = hasRsi ? (separaEscalas ? Math.ceil(panePlotH / 2) : panePlotH) : 0;
    const volumeHeight = hasVolume ? (separaEscalas ? panePlotH - rsiHeight : panePlotH) : 0;

    const pintarCarril = (valores, start, alto, filaParaValor, style, umbrales = []) => {
      if (alto < 1) return;
      const carril = Array.from({ length: alto }, () => Array(plotW).fill(null));
      for (const nivel of umbrales) {
        const row = Math.round(filaParaValor(nivel));
        for (let col = 0; col < plotW; col++) celdaLinea(carril, row, col, '·', { fg: 'reader' });
      }
      if (tieneValores(valores)) dibujarEscalon(carril, valores, colForIndex, filaParaValor, style);

      for (let r = 0; r < alto; r++) {
        const row = panePlotStart + start + r;
        for (let col = 0; col < plotW; col++) {
          if (carril[r][col]) cells[row][axisW + col] = carril[r][col];
        }
        if (showAxis) {
          if (r === 0) putText(cells, row, 0, '100', { fg: 'reader' });
          else if (r === alto - 1) putText(cells, row, 0, '0', { fg: 'reader' });
        }
      }
    };

    if (hasRsi) {
      pintarCarril(
        rsiVisible,
        0,
        rsiHeight,
        value => ((100 - Math.max(0, Math.min(100, value))) / 100) * (rsiHeight - 1),
        { fg: 'accent' },
        rsiHeight >= 3 ? [30, 70] : []
      );
    }
    if (hasVolume) {
      pintarCarril(
        volumeVisible,
        hasRsi ? rsiHeight : 0,
        volumeHeight,
        value => maxVolume > 0 ? ((maxVolume - value) / maxVolume) * (volumeHeight - 1) : volumeHeight - 1,
        { fg: 'success' }
      );
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
