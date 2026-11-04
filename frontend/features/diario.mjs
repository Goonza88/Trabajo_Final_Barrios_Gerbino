// diario de operaciones - metricas y tabla de operaciones, en el lugar del grafico

import { cols, gap, rows, table, text } from '../../backend/terminal/widgets.mjs';
import { sanitize } from '../../backend/terminal/ansi.mjs';
import { metricasOperaciones, pnlOperacion } from '../../backend/dominio/operaciones.mjs';
import { errorOrden, filasDiario, preciosActuales } from '../estado/operaciones.mjs';
import { fmtPrecio } from './watchlist.mjs';

const ENCABEZADOS = ['#', 'fecha', 'simbolo', 'lado', 'tipo', 'estado', 'entrada', 'tp', 'sl', 'salida', 'pnl'];
const LADOS = { compra: 'long', venta: 'short' };

// colores del lado y de los cierres
const VERDE = { fg: 'success' };
const ROJO = { fg: 'danger' };

// columnas que se sacan primero cuando la tabla no entra
const PRESCINDIBLES = ['tp', 'sl', 'tipo', 'salida', 'fecha', 'simbolo'];

// lineas fijas alrededor de la tabla
const FIJAS = 7;

// monto en dos decimales con signo y color
function monto(valor) {
  if (valor == null) return { text: '-' };
  const numero = Number(valor);
  return { text: (numero > 0 ? '+' : '') + numero.toFixed(2), style: numero === 0 ? '' : { fg: numero > 0 ? 'success' : 'danger' } };
}

// dia, mes y hora en 24 horas, o corto
function fecha(instante) {
  const d = new Date(instante);
  const dos = n => String(n).padStart(2, '0');
  return dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes());
}

// estado de la operacion, o el motivo si cerro, con colores
function estadoCelda(operacion) {
  if (operacion.estado !== 'cerrada') return operacion.estado;
  const estilos = { tp: VERDE, sl: ROJO };
  return { text: operacion.motivo_cierre, style: estilos[operacion.motivo_cierre] ?? '' };
}

function filaTabla(operacion, precios) {
  return [
    String(operacion.id),
    fecha(operacion.creada_en),
    operacion.symbol,
    { text: LADOS[operacion.lado], style: operacion.lado === 'compra' ? VERDE : ROJO },
    operacion.tipo,
    estadoCelda(operacion),
    fmtPrecio(operacion.precio_entrada),
    { text: fmtPrecio(operacion.take_profit), style: operacion.take_profit == null ? '' : VERDE },
    { text: fmtPrecio(operacion.stop_loss), style: operacion.stop_loss == null ? '' : ROJO },
    fmtPrecio(operacion.precio_salida),
    monto(pnlOperacion(operacion, precios[operacion.symbol] ?? null)),
  ];
}

// metricas de las operaciones cerradas
function lineaMetricas(operaciones) {
  const m = metricasOperaciones(operaciones);
  const porcentaje = valor => valor == null ? '-' : valor.toFixed(1) + '%';
  const proporcion = valor => valor == null ? '-' : valor.toFixed(2);
  const pnl = monto(m.pnl_total);
  return cols([
    text('cerradas ' + m.cerradas + ' | pnl ', { fg: 'sec' }),
    text(pnl.text, pnl.style),
    text(' | win ' + porcentaje(m.win_rate) + ' | pf ' + proporcion(m.profit_factor) + ' | ev ', { fg: 'sec' }),
    text(monto(m.valor_esperado).text, monto(m.valor_esperado).style),
  ], { gap: 0 });
}

// texto plano de una celda para medirla
const textoCelda = celda => typeof celda === 'object' ? celda.text : celda;

// encabezados y filas sin las columnas prescindibles que no entran
function columnasQueEntran(filas, width) {
  let columnas = ENCABEZADOS.map((_, i) => i);
  const ancho = () => columnas.reduce((total, i) =>
    total + Math.max(ENCABEZADOS[i].length, ...filas.map(fila => textoCelda(fila[i]).length)) + 1, -1);
  for (const nombre of PRESCINDIBLES) {
    if (ancho() <= width) break;
    columnas = columnas.filter(i => ENCABEZADOS[i] !== nombre);
  }
  return { headers: columnas.map(i => ENCABEZADOS[i]), rows: filas.map(fila => columnas.map(i => fila[i])) };
}

export function vistaDiario(estado, { width, height }) {
  const filas = filasDiario(estado);
  const precios = preciosActuales(estado);
  const { cursor, notas } = estado.diario;
  // ventana de filas que entran despues de la actual
  const maxFilas = Math.max(1, height - FIJAS);
  const inicio = Math.max(0, Math.min(cursor - maxFilas + 1, filas.length - maxFilas));
  const visibles = filas.slice(inicio, inicio + maxFilas);
  const pie = notas != null
    ? text('Enter linea siguiente | flechas moverse | Esc guardar', { fg: 'sec' })
    : errorOrden(estado)
      ? text('err: ' + sanitize(errorOrden(estado)), { fg: 'danger' })
      : text('j k elegir | m cerrar a mercado | Backspace cancelar | Enter notas', { fg: 'sec' });

  return rows([
    text('diario', { fg: 'accent', bold: true }),
    gap(1),
    lineaMetricas(estado.operaciones),
    gap(1),
    filas.length
      ? table({ ...columnasQueEntran(visibles.map(operacion => filaTabla(operacion, precios)), width), cursor: cursor - inicio, fill: true })
      : text('sin operaciones', { fg: 'sec' }),
    gap(Math.max(1, maxFilas - visibles.length + 1)),
    pie,
  ]);
}
