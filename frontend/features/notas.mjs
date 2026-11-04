// caja de notas de la operacion elegida en el diario - markdown simple y edicion por lineas

import { box, cols, input, rows, text } from '../../backend/terminal/widgets.mjs';
import { textWidth } from '../../backend/terminal/ansi.mjs';
import { boxSize } from '../../backend/terminal/layout.mjs';
import { filasDiario } from '../estado/operaciones.mjs';

// alto de la caja de notas
export function altoNotas(height) {
  return Math.min(12, Math.max(6, Math.floor(height * 0.3)));
}

// filas para lineas de notas en la caja
export function filasNotas(height) {
  return Math.max(1, altoNotas(height) - 3);
}

// titulo de la caja
function titulo(aviso, derecha, ancho) {
  return cols([text(aviso, { fg: 'sec' }), text(derecha, { fg: 'sec' })], { widths: [Math.max(0, ancho - textWidth(derecha))], gap: 0 });
}

// tramos de una linea con negrita, cursiva y codigo
function tramos(texto) {
  const partes = [];
  const marca = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let desde = 0;
  for (const coincidencia of texto.matchAll(marca)) {
    if (coincidencia.index > desde) partes.push(text(texto.slice(desde, coincidencia.index)));
    const [, negrita, cursiva, codigo] = coincidencia;
    if (negrita != null) partes.push(text(negrita, { bold: true }));
    else if (cursiva != null) partes.push(text(cursiva, { italic: true }));
    else partes.push(text(codigo, { fg: 'sec' }));
    desde = coincidencia.index + coincidencia[0].length;
  }
  if (desde < texto.length) partes.push(text(texto.slice(desde)));
  return partes;
}

// una linea de markdown
export function lineaMarkdown(linea) {
  const titulo = linea.match(/^(#{1,3})\s+(.*)$/);
  if (titulo) return text(titulo[2], { fg: 'accent', bold: titulo[1].length === 1 });
  const item = linea.match(/^\s*[-*]\s+(.*)$/);
  const partes = item ? [text('• ', { fg: 'sec' }), ...tramos(item[1])] : tramos(linea);
  return partes.length ? cols(partes, { gap: 0 }) : text('');
}

export function vistaNotas(estado, { width, height }) {
  const edicion = estado.diario.notas;
  const marco = { border: 'round', pad: [0, 1], height, borderStyle: { fg: edicion ? 'accent' : 'sec' } };
  const { innerW, innerH } = boxSize(marco, width);
  const operacion = filasDiario(estado)[estado.diario.cursor];
  const derecha = operacion ? 'notas #' + operacion.id : 'notas';
  const lugar = Math.max(1, innerH - 1);

  if (edicion) {
    // ventana de lineas que sigue a la que se edita
    const inicio = Math.max(0, Math.min(edicion.linea - lugar + 1, edicion.lineas.length - lugar));
    const lineas = edicion.lineas.slice(inicio, inicio + lugar).map((linea, i) => inicio + i === edicion.linea
      ? input({ value: linea, focused: true, width: innerW })
      : text(linea || '·', { fg: linea ? 'text' : 'muted' }));
    return box(rows([titulo('', derecha, innerW), ...lineas]), marco);
  }
  const escritas = operacion?.notas ? operacion.notas.split('\n') : [];
  const aviso = escritas.length ? '' : operacion ? 'sin notas - Enter para escribir' : 'sin operaciones';
  return box(rows([titulo(aviso, derecha, innerW), ...escritas.slice(0, lugar).map(lineaMarkdown)]), marco);
}
