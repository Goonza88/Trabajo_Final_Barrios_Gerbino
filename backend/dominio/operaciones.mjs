// casos de uso de operaciones de practica - validan el borrador y deciden activaciones y cierres

import { comparar, parse } from '../metricas/decimal.mjs';
import { cantidadPorPorcentaje, pnlOperacion } from '../metricas/operaciones.mjs';
import { activacionPendiente, cierrePorNivel } from '../metricas/niveles.mjs';

// cartera y metricas pasan por el dominio, la interfaz no llama a metricas
export { metricasOperaciones, resumenCartera } from '../metricas/operaciones.mjs';

// lado segun donde queda el take profit, o el stop loss si no hay
function ladoDe(entrada, tp, sl) {
  if (tp != null && comparar(tp, entrada) !== 0) return comparar(tp, entrada) > 0 ? 'compra' : 'venta';
  if (sl != null && comparar(sl, entrada) !== 0) return comparar(sl, entrada) < 0 ? 'compra' : 'venta';
  throw new Error('falta take profit o stop loss para saber el lado');
}

// en compra tp arriba y sl abajo de la entrada, en venta al reves
function validarNiveles(lado, entrada, tp, sl) {
  const arriba = lado === 'compra' ? 1 : -1;
  if (tp != null && comparar(tp, entrada) !== arriba) throw new Error('take profit del lado equivocado para ' + lado);
  if (sl != null && comparar(sl, entrada) !== -arriba) throw new Error('stop loss del lado equivocado para ' + lado);
}

// operacion nueva desde el borrador, con la forma de la fila del contrato sin id
export function crearOperacion(borrador, { exchange_id, symbol, saldo, porcentaje, ahora }) {
  const { tipo, entrada, take_profit: tp = null, stop_loss: sl = null } = borrador;
  if (tipo !== 'mercado' && tipo !== 'limite') throw new Error('falta la entrada');
  if (entrada == null) throw new Error('falta la entrada');
  if (String(saldo).startsWith('-') || parse(saldo) === 0n) throw new Error('sin saldo');
  if (parse(porcentaje) === 0n || comparar(porcentaje, '100') > 0) throw new Error('porcentaje invalido: ' + porcentaje);
  const lado = ladoDe(entrada, tp, sl);
  validarNiveles(lado, entrada, tp, sl);
  const cantidad = cantidadPorPorcentaje(saldo, porcentaje, entrada);
  if (parse(cantidad) === 0n) throw new Error('cantidad nula para el saldo y porcentaje');
  const abierta = tipo === 'mercado';
  return {
    exchange_id,
    symbol,
    lado,
    tipo,
    cantidad,
    precio_entrada: entrada,
    take_profit: tp,
    stop_loss: sl,
    precio_salida: null,
    fees: '0',
    creada_en: ahora,
    abierta_en: abierta ? ahora : null,
    cerrada_en: null,
    motivo_cierre: null,
    estado: abierta ? 'abierta' : 'pendiente',
    notas: null,
    tags: [],
  };
}

// vista previa del borrador - lado, cantidad y resultado en tp y sl, o el error que impide confirmarlo
export function previsualizarBorrador(borrador, { saldo, porcentaje }) {
  try {
    const operacion = crearOperacion(borrador, { exchange_id: null, symbol: null, saldo, porcentaje, ahora: 0 });
    const cerrarEn = precio => precio == null ? null : pnlOperacion({ ...operacion, estado: 'cerrada', precio_salida: precio });
    const en_tp = cerrarEn(operacion.take_profit);
    const en_sl = cerrarEn(operacion.stop_loss);
    // ganancia en tp por cada unidad de perdida en sl
    const ratio = en_tp != null && en_sl != null && Number(en_sl) < 0 ? Number(en_tp) / -Number(en_sl) : null;
    return { lado: operacion.lado, cantidad: operacion.cantidad, en_tp, en_sl, ratio, error: null };
  } catch (e) {
    return { lado: null, cantidad: null, en_tp: null, en_sl: null, ratio: null, error: e.message };
  }
}

// velas que cuentan desde un instante y el precio actual como una vela sin rango
function tramosDesde(velas, desde, precio, ahora) {
  const tramos = velas.filter(vela => vela.open_time >= desde);
  return precio == null ? tramos : [...tramos, { open_time: ahora, high: precio, low: precio }];
}

// activa pendientes y cierra abiertas del simbolo por tp o sl - devuelve la lista nueva y los eventos
export function seguirOperaciones(operaciones, { symbol, velas, precio = null, ahora }) {
  const eventos = [];
  const siguientes = operaciones.map(original => {
    if (original.symbol !== symbol) return original;
    let operacion = original;
    if (operacion.estado === 'pendiente') {
      const tramos = tramosDesde(velas, operacion.creada_en, precio, ahora);
      const vela = activacionPendiente(operacion, tramos);
      if (!vela) return operacion;
      operacion = { ...operacion, estado: 'abierta', abierta_en: ahora };
      eventos.push({ tipo: 'activada', operacion });
      const restantes = tramos.slice(tramos.indexOf(vela) + 1);
      return cerrarSiToca(operacion, restantes, ahora, eventos);
    }
    if (operacion.estado !== 'abierta') return operacion;
    return cerrarSiToca(operacion, tramosDesde(velas, operacion.abierta_en, precio, ahora), ahora, eventos);
  });
  return { operaciones: siguientes, eventos };
}

// cierra en el primer tramo que toca tp o sl, y anota el evento
function cerrarSiToca(operacion, tramos, ahora, eventos) {
  const cierre = cierrePorNivel(operacion, tramos);
  if (!cierre) return operacion;
  const cerrada = { ...operacion, estado: 'cerrada', precio_salida: cierre.precio_salida, motivo_cierre: cierre.motivo_cierre, cerrada_en: ahora };
  eventos.push({ tipo: 'cerrada', operacion: cerrada });
  return cerrada;
}

// cierre manual de una abierta al precio dado
export function cerrarOperacion(operacion, precio, ahora) {
  if (operacion.estado !== 'abierta') throw new Error('la operacion no esta abierta: ' + operacion.estado);
  parse(precio);
  return { ...operacion, estado: 'cerrada', precio_salida: precio, motivo_cierre: 'manual', cerrada_en: ahora };
}

// cancela una pendiente o una abierta sin precio de salida
export function cancelarOperacion(operacion, ahora) {
  if (operacion.estado !== 'pendiente' && operacion.estado !== 'abierta') {
    throw new Error('la operacion no esta abierta: ' + operacion.estado);
  }
  return { ...operacion, estado: 'cancelada', cerrada_en: ahora };
}
