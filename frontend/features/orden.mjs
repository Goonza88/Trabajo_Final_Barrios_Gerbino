// caja de la orden en armado - vista previa del borrador, cartera y porcentaje del saldo

import { box, cols, gap, rows, text } from '../../backend/terminal/widgets.mjs';
import { padRight, sanitize } from '../../backend/terminal/ansi.mjs';
import { previsualizarBorrador, resumenCartera } from '../../backend/dominio/operaciones.mjs';
import { LADOS, fmtPrecio, monto as celdaMonto } from '../formato.mjs';
import { borradorVigente, errorOrden, preciosActuales } from '../estado/operaciones.mjs';

export const ANCHO_ORDEN = 30;

// columnas de la etiqueta, los valores van despues
const ETIQUETA = 12;

// hay orden en armado con cualquier entrada, tp o sl
export function hayBorrador(borrador) {
  return borrador.entrada != null || borrador.take_profit != null || borrador.stop_loss != null;
}

// etiqueta de ancho fijo y sus valores pegados
const fila = (etiqueta, ...valores) => cols([text(etiqueta), ...valores], { widths: [ETIQUETA], gap: 0 });

// monto en dos decimales - con signo y color si es un resultado
function monto(valor, resultado = true) {
  if (!resultado) return text(valor == null ? '-' : Number(valor).toFixed(2));
  const celda = celdaMonto(valor);
  return text(celda.text, celda.style);
}

// ganancia:perdida, la ganancia en verde y la perdida en rojo
function ratio(valor) {
  if (valor == null) return [text('-')];
  return [text(valor.toFixed(2), { fg: 'success' }), text(':'), text('1', { fg: 'danger' })];
}

export function vistaOrden(estado, { width, height }) {
  const enfocada = estado.foco === 'orden';
  const marco = { border: 'round', pad: [0, 1], width, height, borderStyle: { fg: enfocada ? 'accent' : 'sec' } };
  const borrador = borradorVigente(estado);
  const cartera = resumenCartera(estado.saldo_inicial, estado.operaciones, preciosActuales(estado));
  const previa = previsualizarBorrador(borrador, { saldo: cartera.saldo, porcentaje: estado.porcentaje });
  const nivel = (precio, fg) => text(fmtPrecio(precio), precio == null ? '' : { fg });
  // con foco la fila del porcentaje se resalta de lado a lado
  const porcentaje = padRight(padRight('porcentaje', ETIQUETA) + estado.porcentaje + '%', width - 4);
  const aviso = errorOrden(estado)
    ? text('err: ' + sanitize(errorOrden(estado)), { fg: 'danger' })
    : previa.error ? text(sanitize(previa.error), { fg: 'sec' }) : null;

  return box(rows([
    text('orden', { fg: 'accent', bold: true }),
    gap(1),
    fila('tipo', text(borrador.tipo ?? '-')),
    fila('lado', text(LADOS[previa.lado] ?? '-')),
    fila('entrada', nivel(borrador.entrada, 'text')),
    fila('take profit', nivel(borrador.take_profit, 'success')),
    fila('stop loss', nivel(borrador.stop_loss, 'danger')),
    fila('cantidad', text(fmtPrecio(previa.cantidad))),
    fila('en tp', monto(previa.en_tp)),
    fila('en sl', monto(previa.en_sl)),
    fila('ratio', ...ratio(previa.ratio)),
    aviso,
    gap(1),
    text('cartera', { fg: 'accent', bold: true }),
    gap(1),
    fila('saldo', monto(cartera.saldo, false)),
    fila('flotante', monto(cartera.flotante)),
    fila('account', monto(cartera.patrimonio, false)),
    gap(1),
    text(porcentaje, enfocada ? { fg: 'accent', bg: 'selected' } : ''),
    gap(1),
    text('CONFIRMAR (Enter)', { fg: 'accent', bold: true }),
  ].filter(Boolean)), marco);
}
