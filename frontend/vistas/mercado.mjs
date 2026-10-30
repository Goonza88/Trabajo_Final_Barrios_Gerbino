import { box, rows, text, table } from '../../backend/terminal/widgets.mjs';
import { size } from '../../backend/terminal/runtime.mjs';
import { sanitize } from '../../backend/terminal/ansi.mjs';
import { restar, formatear } from '../../backend/metricas/decimal.mjs';
import { graficoVelas } from '../graficos/velas.mjs';

function cambio(velas) {
  if (velas.length < 2) return null;
  const a = velas[velas.length - 2];
  const b = velas[velas.length - 1];
  try {
    const diff = restar(b.close, a.close);
    return formatear(diff);
  } catch {
    return null;
  }
}

function fmtHora(ts) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleTimeString('es-AR'); } catch { return '-'; }
}

export function vistaMercado(estado, modoTabla = false) {
  const { cols, rows: filasTerminal } = size();
  const h = filasTerminal;
  const error = estado.error ? sanitize(estado.error) : null;
  const total = estado.velas.length;
  const start = Math.max(0, total - estado.zoomX - estado.offset);
  const end = Math.max(start, total - estado.offset);
  const vis = estado.velas.slice(start, end);
  const filas = vis.slice().reverse().map(v => [
    new Date(v.open_time).toLocaleTimeString('es-AR'),
    v.open,
    v.high,
    v.low,
    v.close,
    v.volume
  ]);

  if (modoTabla) {
    const chart = box(rows([
      text(estado.symbol + ' ' + estado.interval + ' @ binance | ultimo:' + (estado.ultimo ?? '-') + ' | delta:' + (cambio(estado.velas) ?? '-') + ' | act:' + fmtHora(estado.actualizado_en) + ' | a:1m s:5m d:1h f:4h g:1d  t:grafico h/j/k/l:pan y/o:tiempo u/i:precio p:prec' + (estado.precision ? '(on)' : '(off)') + ' q', { fg: 'accent' }),
      { type: 'gap', h: 1 },
      table({ headers: ['hora', 'open', 'high', 'low', 'close', 'vol'], rows: filas, fill: true, align: 'center' }),
      error ? text('err: ' + error, { fg: 'danger' }) : null
    ].filter(Boolean)), { border: 'round', pad: [0, 1], height: h });
    return chart;
  }

  const chart = box(rows([
    text(estado.symbol + ' ' + estado.interval + ' @ binance | ultimo:' + (estado.ultimo ?? '-') + ' | delta:' + (cambio(estado.velas) ?? '-') + ' | act:' + fmtHora(estado.actualizado_en) + ' | a:1m s:5m d:1h f:4h g:1d  t:tabla h/j/k/l:pan y/o:tiempo u/i:precio p:prec' + (estado.precision ? '(on)' : '(off)') + ' q', { fg: 'accent' }),
    { type: 'gap', h: 1 },
    graficoVelas({
      velas: vis,
      width: Math.max(1, cols - 4),
      height: Math.max(2, filasTerminal - 5),
      showAxis: true,
      interval: estado.interval,
      zoomY: estado.zoomY,
      offsetY: estado.offsetY || 0
    })
  ].concat(error ? [text('err: ' + error, { fg: 'danger' })] : [])), { border: 'round', pad: [0, 1], height: h });

  return chart;
}
