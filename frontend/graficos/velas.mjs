// arma el grafico de velas como una matriz de celdas para el substrato

import { grid, table } from '../../backend/terminal/widgets.mjs';

// velas por mitades de fila
const TRAZOS = {
  'mecha,': '╵',
  ',mecha': '╷',
  'mecha,mecha': '│',
  'cuerpo,': '╹',
  ',cuerpo': '╻',
  'cuerpo,cuerpo': '┃',
  'mecha,cuerpo': '╽',
  'cuerpo,mecha': '╿',
};

// cuerpo sin alto (doji o casi) en el medio de la fila - raya gruesa cruzada por la mecha
const MARCAS = {
  'mecha,mecha': '┿',
  'mecha,': '┷',
  ',mecha': '┯',
  ',': '━',
};

// columnas del eje de precios a la izquierda del grafico
function anchoEje(totalW, showAxis) {
  return showAxis ? Math.min(9, Math.max(0, totalW - 1)) : 0;
}

export function anchoPlot(width, showAxis = true) {
  const totalW = Math.max(1, Math.floor(width));
  return Math.max(1, totalW - anchoEje(totalW, showAxis));
}

// verde si la vela cerro arriba o igual a su apertura, roja si cerro abajo
function estiloVela(vela) {
  return { fg: Number(vela.close) >= Number(vela.open) ? 'success' : 'danger' };
}

// volumen con la parte entera en al menos dos digitos
function fmtVolumen(valor) {
  const [entera, ...decimales] = String(valor).split('.');
  return [entera.padStart(2, '0'), ...decimales].join('.');
}

// mismas velas en una tabla, la mas reciente arriba - valores del color de la vela
export function tablaVelas(velas) {
  const filas = velas.slice().reverse().map(v => {
    const style = estiloVela(v);
    return [
      new Date(v.open_time).toLocaleTimeString('es-AR'),
      ...[v.open, v.high, v.low, v.close, fmtVolumen(v.volume)].map(text => ({ text, style })),
    ];
  });
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

// linea escalonada - estilo(i) pinta el tramo del punto i hasta el siguiente
function dibujarEscalon(plot, valores, colForIndex, filaParaValor, estilo) {
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
    const style = estilo(i);
    if (!anterior) {
      celdaLinea(plot, row, col, '─', style);
      anterior = { row, col, style };
      continue;
    }

    // arranca despues del punto anterior para no pisar su esquina
    for (let x = anterior.col + 1; x < col; x++) celdaLinea(plot, anterior.row, x, '─', anterior.style);
    if (row === anterior.row) {
      celdaLinea(plot, row, col, '─', style);
    } else {
      const arriba = Math.min(row, anterior.row);
      const abajo = Math.max(row, anterior.row);
      for (let y = arriba + 1; y < abajo; y++) celdaLinea(plot, y, col, '│', style);
      const baja = row > anterior.row;
      celdaLinea(plot, anterior.row, col, baja ? '╮' : '╯', style);
      celdaLinea(plot, row, col, baja ? '╰' : '╭', style);
    }
    anterior = { row, col, style };
  }
}

// columna de la vela i - las velas se reparten en todo el ancho del grafico
function columnaVela(i, cantidad, plotW) {
  if (cantidad <= 1) return Math.floor(plotW / 2);
  return Math.round((i / Math.max(1, cantidad - 1)) * (plotW - 1));
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
  const plotH = Math.max(1, totalH - timeAxisH);
  const cells = Array.from({ length: totalH }, () => Array(totalW).fill(null));
  const seriesVisibles = serie => Array.isArray(serie) ? serie.slice(-velas.length) : null;
  velas = limitarVelas(velas, plotW);
  const smaVisible = seriesVisibles(indicadores.sma);
  const emaVisible = seriesVisibles(indicadores.ema);
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
  const colForIndex = (i) => columnaVela(i, velas.length, plotW);

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

  // limite de media fila mas cercano a posicion - mitad s va a s + 1 y fila r a 2r o 2r + 1
  const limiteMitad = (p) => Math.round((p + 0.5) * 2);

  // dos formas de dibujar el cuerpo segun donde caen los limites
  function estadosCuerpo(pO, pC) {
    if (!Number.isFinite(pO) || !Number.isFinite(pC)) {
      return [{ inicio: NaN, fin: NaN, open: NaN, close: NaN, local: 0 }];
    }
    const alcista = pC <= pO;
    const yTop = (Math.min(pO, pC) + 0.5) * 2;
    const yBottom = (Math.max(pO, pC) + 0.5) * 2;
    const estado = (inicio, fin) => ({
      inicio,
      fin,
      open: alcista ? fin : inicio,
      close: alcista ? inicio : fin,
      local: (inicio - yTop) ** 2 + (fin - yBottom) ** 2,
    });
    const inicio = limiteMitad(Math.min(pO, pC));
    const fin = limiteMitad(Math.max(pO, pC));
    if (fin > inicio || inicio % 2 === 1) return [estado(inicio, fin)];
    // en un doji apertura y cierre son el mismo limite, en cualquiera de las dos formas
    if (pO === pC) {
      return [inicio - 1, inicio].map(desde => ({ ...estado(desde, desde + 1), open: inicio, close: inicio }));
    }
    return [estado(inicio - 1, inicio), estado(inicio, inicio + 1)];
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
    const style = estiloVela(c);
    if (col < 0 || col >= plotW) {
      return { col, style, estados: [{ inicio: NaN, fin: NaN, open: NaN, close: NaN, local: 0 }] };
    }
    return { col, style, estados: estadosCuerpo(py(o), py(cl)) };
  });
  const eleccion = elegirCuerpos(cuerpos);

  for (let i = 0; i < velas.length; i++) {
    const { col, style } = cuerpos[i];
    if (col < 0 || col >= plotW) continue;
    const estado = cuerpos[i].estados[eleccion[i]];
    const conCuerpo = Number.isFinite(estado.inicio);
    // la mecha llega al menos hasta el cuerpo, para que siempre se toquen
    const desde = Math.min(limiteMitad(py(Number(velas[i].high))), conCuerpo ? estado.inicio : Infinity);
    const hasta = Math.max(limiteMitad(py(Number(velas[i].low))), conCuerpo ? estado.fin : -Infinity);
    // fila de la raya cuando el cuerpo no tiene alto
    const marca = conCuerpo && estado.inicio === estado.fin ? (estado.inicio - 1) / 2 : null;
    const mitad = (s) => {
      if (s < desde || s >= hasta) return '';
      return conCuerpo && s >= estado.inicio && s < estado.fin ? 'cuerpo' : 'mecha';
    };
    const primera = Math.max(0, Math.floor(desde / 2));
    const ultima = Math.min(plotH - 1, Math.floor((hasta - 1) / 2));
    for (let row = primera; row <= ultima; row++) {
      const clave = mitad(2 * row) + ',' + mitad(2 * row + 1);
      const ch = row === marca ? MARCAS[clave] : TRAZOS[clave];
      if (ch) plot[row][col] = { ch, style };
    }
  }

  for (const serie of priceSeries) {
    dibujarEscalonCapa(plot, serie.values, colForIndex, py, () => serie.style);
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

// un indicador en su carril bajo el grafico, de 0 a tope o al maximo visible, con las columnas de graficoVelas
export function graficoInferior({
  velas = [],
  width,
  height,
  showAxis = true,
  valores = [],
  tope = null,
  umbrales = [],
  style = { fg: 'accent' },
  colorDeVela = false,
} = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError('graficoInferior: faltan width y height');
  }

  const totalW = Math.max(1, Math.floor(width));
  const axisW = anchoEje(totalW, showAxis);
  const plotW = anchoPlot(totalW, showAxis);
  const totalH = Math.max(1, Math.floor(height));
  const cells = Array.from({ length: totalH }, () => Array(totalW).fill(null));
  const visibles = limitarVelas(velas, plotW);
  if (!visibles.length) return grid({ width: totalW, height: totalH, cells });

  const serie = valores.slice(-visibles.length);
  const numeros = serie.filter(valor => valor != null && Number.isFinite(Number(valor))).map(Number);
  const maximo = tope ?? Math.max(0, ...numeros);
  const fila = valor => maximo > 0
    ? ((maximo - Math.max(0, Math.min(maximo, valor))) / maximo) * (totalH - 1)
    : totalH - 1;
  const colForIndex = (i) => columnaVela(i, visibles.length, plotW);

  const carril = Array.from({ length: totalH }, () => Array(plotW).fill(null));
  if (totalH >= 3) {
    for (const nivel of umbrales) {
      const row = Math.round(fila(nivel));
      for (let col = 0; col < plotW; col++) celdaLinea(carril, row, col, '·', { fg: 'reader' });
    }
  }
  const estilo = colorDeVela ? i => estiloVela(visibles[i]) : () => style;
  if (tieneValores(serie)) dibujarEscalon(carril, serie, colForIndex, fila, estilo);

  for (let row = 0; row < totalH; row++) {
    for (let col = 0; col < plotW; col++) {
      if (carril[row][col]) cells[row][axisW + col] = carril[row][col];
    }
  }
  if (showAxis) {
    putText(cells, 0, 0, '100', { fg: 'reader' });
    if (totalH > 1) putText(cells, totalH - 1, 0, '0', { fg: 'reader' });
  }

  return grid({ width: totalW, height: totalH, cells });
}
