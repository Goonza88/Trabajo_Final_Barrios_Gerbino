import { box, gap, rows, split, table, text } from '../../backend/terminal/widgets.mjs';
import { size } from '../../backend/terminal/runtime.mjs';
import { sanitize } from '../../backend/terminal/ansi.mjs';
import { boxSize } from '../../backend/terminal/layout.mjs';
import { anchoPlot, graficoVelas } from '../graficos/velas.mjs';
import { anchoWatchlist, fmtPrecio, fmtVariacion, indiceTickers, variacion, vistaWatchlist } from '../features/watchlist.mjs';
import { calcularIndicadores, PERIODOS_INDICADORES } from '../../backend/metricas/indicadores.mjs';

function fmtHora(ts) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleTimeString('es-AR'); } catch { return '-'; }
}

function dimensionesMercado(estado, cols) {
  const watchW = Math.max(anchoWatchlist(estado), Math.min(32, Math.floor(cols * 0.38)));
  const chartW = Math.max(1, cols - watchW - 1);
  return { watchW, chartW };
}

export function capacidadVelas(estado, cols = size().cols) {
  const { chartW } = dimensionesMercado(estado, cols);
  const marco = { border: 'round', pad: [0, 1] };
  const { innerW } = boxSize(marco, chartW);
  return anchoPlot(innerW, true);
}

export function cantidadVelasVisibles(estado, modoTabla = false, cols = size().cols) {
  const zoomX = Math.max(1, Math.floor(estado.zoomX ?? 80));
  return modoTabla ? zoomX : Math.min(zoomX, capacidadVelas(estado, cols));
}

export function rangoVentanaVelas(total, cantidad, offset = 0) {
  const count = Math.max(1, Math.floor(cantidad));
  const maxOffset = Math.max(0, total - count);
  const safeOffset = Number.isFinite(offset)
    ? Math.max(0, Math.min(maxOffset, Math.floor(offset)))
    : 0;
  const fin = total - safeOffset;
  return { inicio: Math.max(0, fin - count), fin };
}

export function ventanaVelas(velas, cantidad, offset = 0) {
  const { inicio, fin } = rangoVentanaVelas(velas.length, cantidad, offset);
  return velas.slice(inicio, fin);
}

function leyendaIndicadores(estado) {
  const activos = estado.indicadores ?? {};
  const estadoCorto = nombre => activos[nombre] ? '+' : '-';
  return [
    `1:SMA${PERIODOS_INDICADORES.sma}${estadoCorto('sma')}`,
    `2:EMA${PERIODOS_INDICADORES.ema}${estadoCorto('ema')}`,
    `3:RSI${PERIODOS_INDICADORES.rsi}${estadoCorto('rsi')}`,
    `4:VOL${estadoCorto('volume')}`,
    `5:BB${PERIODOS_INDICADORES.bollinger}x${PERIODOS_INDICADORES.bollingerDesviaciones}${estadoCorto('bollinger')}`
  ].join(' ');
}

function panelGrafico(estado, width, height, modoTabla, visibleCount) {
  const marco = {
    border: 'round',
    pad: [0, 1],
    height,
    borderStyle: estado.foco === 'grafico' ? { fg: 'accent' } : null
  };
  const { innerW, innerH } = boxSize(marco, width);
  const error = estado.error ? sanitize(estado.error) : null;
  const { inicio, fin } = rangoVentanaVelas(estado.velas.length, visibleCount, estado.offset);
  const vis = estado.velas.slice(inicio, fin);
  const activos = estado.indicadores ?? {};
  const necesitaCalculo = Object.values(activos).some(Boolean);
  const calculados = necesitaCalculo ? calcularIndicadores(estado.velas) : null;
  const recortar = valores => valores.slice(inicio, fin);
  const indicadores = {
    sma: activos.sma ? recortar(calculados.sma) : null,
    ema: activos.ema ? recortar(calculados.ema) : null,
    rsi: activos.rsi ? recortar(calculados.rsi) : null,
    volume: activos.volume ? recortar(calculados.volume) : null,
    bollinger: activos.bollinger ? {
      middle: recortar(calculados.bollinger.middle),
      upper: recortar(calculados.bollinger.upper),
      lower: recortar(calculados.bollinger.lower),
    } : null,
  };
  const ticker = indiceTickers(estado.tickers)[estado.symbol];
  const precio = estado.ultimo ?? ticker?.price ?? null;
  const cabecera = estado.symbol + ' ' + estado.interval + ' | ' + fmtPrecio(precio)
    + ' | 24h:' + fmtVariacion(ticker ? variacion(ticker) : null)
    + ' | ' + fmtHora(estado.actualizado_en);

  if (modoTabla) {
    const filas = vis.slice().reverse().map(v => [
      new Date(v.open_time).toLocaleTimeString('es-AR'),
      v.open,
      v.high,
      v.low,
      v.close,
      v.volume
    ]);
    return box(rows([
      text(cabecera, { fg: 'accent' }),
      text(leyendaIndicadores(estado), { fg: 'muted' }),
      gap(1),
      table({ headers: ['hora', 'open', 'high', 'low', 'close', 'vol'], rows: filas, fill: true, align: 'center' }),
      error ? text('err: ' + error, { fg: 'danger' }) : null
    ].filter(Boolean)), marco);
  }

  return box(rows([
    text(cabecera, { fg: 'accent' }),
    text(leyendaIndicadores(estado), { fg: 'muted' }),
    gap(1),
    graficoVelas({
      velas: vis,
      width: innerW,
      height: Math.max(2, (innerH ?? height) - 4),
      showAxis: true,
      interval: estado.interval,
      zoomY: estado.zoomY,
      offsetY: estado.offsetY || 0,
      indicadores,
    }),
    error ? text('err: ' + error, { fg: 'danger' }) : null
  ].filter(Boolean)), marco);
}

export function vistaMercado(estado, modoTabla = false) {
  const { cols, rows: filasTerminal } = size();
  const height = filasTerminal;
  const { watchW, chartW } = dimensionesMercado(estado, cols);
  const visibleCount = cantidadVelasVisibles(estado, modoTabla, cols);
  return split({
    dir: 'h',
    sizes: [watchW, null],
    gap: 1,
    children: [
      vistaWatchlist(estado, { width: watchW, height }),
      panelGrafico(estado, chartW, height, modoTabla, visibleCount)
    ]
  });
}
