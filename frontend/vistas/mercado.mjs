import { box, rows, text, table, split } from '../../backend/terminal/widgets.mjs';
import { size } from '../../backend/terminal/runtime.mjs';
import { restar, formatear } from '../../backend/metricas/decimal.mjs';

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

export function vistaMercado(estado) {
  const h = size().rows;
  const velas = estado.velas.slice(-15).reverse();
  const filas = velas.map(v => [
    new Date(v.open_time).toLocaleTimeString('es-AR'),
    v.open,
    v.high,
    v.low,
    v.close,
    v.volume
  ]);

  const header = box(rows([
    text(estado.symbol + ' ' + estado.interval + ' @ binance', { fg: 'accent', bold: true }),
    text('ultimo: ' + (estado.ultimo ?? '-'), { fg: 'text' }),
    text('delta ult vela: ' + (cambio(estado.velas) ?? '-'), { fg: 'sec' }),
    estado.error ? text('err: ' + estado.error, { fg: 'danger' }) : null
  ].filter(Boolean)), { border: 'round', pad: [0, 1] });

  const tabla = box(rows([
    text('velas (ultimas)', { fg: 'accent' }),
    { type: 'gap', h: 1 },
    table({ headers: ['hora', 'open', 'high', 'low', 'close', 'vol'], rows: filas, fill: true, align: 'center' })
  ]), { border: 'round', pad: [0, 1], height: Math.max(5, h - 8) });

  return split({ dir: 'v', gap: 1, children: [header, tabla] });
}