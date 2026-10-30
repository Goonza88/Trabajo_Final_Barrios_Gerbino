import { box, gap, rows, split, table, text } from '../../backend/terminal/widgets.mjs';
import { size } from '../../backend/terminal/runtime.mjs';
import { sanitize } from '../../backend/terminal/ansi.mjs';
import { boxSize } from '../../backend/terminal/layout.mjs';
import { graficoVelas } from '../graficos/velas.mjs';
import { anchoWatchlist, fmtPrecio, fmtVariacion, indiceTickers, variacion, vistaWatchlist } from '../features/watchlist.mjs';

function fmtHora(ts) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleTimeString('es-AR'); } catch { return '-'; }
}

function panelGrafico(estado, width, height, modoTabla) {
  const marco = {
    border: 'round',
    pad: [0, 1],
    height,
    borderStyle: estado.foco === 'grafico' ? { fg: 'accent' } : null
  };
  const { innerW, innerH } = boxSize(marco, width);
  const error = estado.error ? sanitize(estado.error) : null;
  const total = estado.velas.length;
  const start = Math.max(0, total - estado.zoomX - estado.offset);
  const end = Math.max(start, total - estado.offset);
  const vis = estado.velas.slice(start, end);
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
      gap(1),
      table({ headers: ['hora', 'open', 'high', 'low', 'close', 'vol'], rows: filas, fill: true, align: 'center' }),
      error ? text('err: ' + error, { fg: 'danger' }) : null
    ].filter(Boolean)), marco);
  }

  return box(rows([
    text(cabecera, { fg: 'accent' }),
    gap(1),
    graficoVelas({
      velas: vis,
      width: innerW,
      height: Math.max(2, (innerH ?? height) - 3),
      showAxis: true,
      interval: estado.interval,
      zoomY: estado.zoomY,
      offsetY: estado.offsetY || 0
    }),
    error ? text('err: ' + error, { fg: 'danger' }) : null
  ].filter(Boolean)), marco);
}

export function vistaMercado(estado, modoTabla = false) {
  const { cols, rows: filasTerminal } = size();
  const height = filasTerminal;
  const watchW = Math.max(anchoWatchlist(estado), Math.min(32, Math.floor(cols * 0.38)));
  const chartW = Math.max(1, cols - watchW - 1);
  return split({
    dir: 'h',
    sizes: [watchW, null],
    gap: 1,
    children: [
      vistaWatchlist(estado, { width: watchW, height }),
      panelGrafico(estado, chartW, height, modoTabla)
    ]
  });
}
