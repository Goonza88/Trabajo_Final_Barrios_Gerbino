// caja del buscador de simbolos - lo escrito, los simbolos del exchange que coinciden y su precio

import { box, gap, input, rows, table, text } from '../../backend/terminal/widgets.mjs';
import { boxSize } from '../../backend/terminal/layout.mjs';
import { sanitize } from '../../backend/terminal/ansi.mjs';
import { resultadosBuscador } from '../estado/buscador.mjs';
import { fmtPrecio } from './watchlist.mjs';

export const ANCHO_BUSCADOR = 30;

// lineas fijas de la caja - titulo, campo, pie y sus espacios
const FIJAS = 6;

export function vistaBuscador(estado, { width, height }) {
  const { buscador } = estado;
  const marco = { border: 'round', pad: [0, 1], width, height, borderStyle: { fg: 'accent' } };
  const { innerW, innerH } = boxSize(marco, width);
  const resultados = resultadosBuscador(estado);
  const lugar = Math.max(1, innerH - FIJAS);
  const inicio = Math.max(0, Math.min(buscador.cursor - lugar + 1, resultados.length - lugar));
  const visibles = resultados.slice(inicio, inicio + lugar);
  const lista = visibles.length
    ? table({ rows: visibles.map(simbolo => [simbolo.symbol, fmtPrecio(simbolo.price)]), cursor: buscador.cursor - inicio, fill: true })
    : text(buscador.cargando ? '' : buscador.texto ? 'sin resultados' : 'escribi un simbolo', { fg: 'sec' });
  const pie = buscador.error
    ? text('err: ' + sanitize(buscador.error), { fg: 'danger' })
    : buscador.cargando
      ? text('cargando simbolos...', { fg: 'sec' })
      : text('Enter agrega | Esc cierra', { fg: 'sec' });

  return box(rows([
    text('agregar simbolo', { fg: 'accent', bold: true }),
    gap(1),
    input({ value: buscador.texto, focused: true, width: innerW }),
    gap(1),
    lista,
    gap(Math.max(1, innerH - FIJAS + 1 - Math.max(1, visibles.length))),
    pie,
  ]), marco);
}
