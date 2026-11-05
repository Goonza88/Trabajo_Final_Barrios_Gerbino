// caja de avisos arriba del grafico - la alerta disparada mas vieja se descarta con foco y Enter

import { box, cols, text } from '../../backend/terminal/widgets.mjs';
import { textWidth } from '../../backend/terminal/ansi.mjs';
import { boxSize } from '../../backend/terminal/layout.mjs';
import { fmtPrecio } from '../formato.mjs';

export const ALTO_AVISO = 3;

export function vistaAviso(estado, { width }) {
  const aviso = estado.avisos[0];
  const marco = { border: 'round', pad: [0, 1], height: ALTO_AVISO, borderStyle: { fg: estado.foco === 'aviso' ? 'accent' : 'sec' } };
  const { innerW } = boxSize(marco, width);
  const arriba = aviso.operador === 'cruza_arriba';
  const pendientes = estado.avisos.length - 1;
  const derecha = (pendientes ? '+' + pendientes + ' | ' : '') + 'Enter descarta';
  const partes = [
    text('alerta ', { fg: 'accent', bold: true }),
    text(aviso.symbol + ' '),
    text(arriba ? 'cruzo arriba de ' : 'cruzo abajo de ', { fg: arriba ? 'success' : 'danger' }),
    text(fmtPrecio(aviso.valor)),
  ];
  const izquierda = partes.reduce((total, parte) => total + textWidth(parte.content), 0);
  return box(cols([...partes, text(' '.repeat(Math.max(1, innerW - izquierda - textWidth(derecha)))), text(derecha, { fg: 'sec' })], { gap: 0 }), marco);
}
