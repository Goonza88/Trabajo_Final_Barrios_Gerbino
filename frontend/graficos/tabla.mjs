// velas en tabla, la mas reciente arriba

import { table } from '../../backend/terminal/widgets.mjs';
import { estiloVela } from './trazos.mjs';

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
