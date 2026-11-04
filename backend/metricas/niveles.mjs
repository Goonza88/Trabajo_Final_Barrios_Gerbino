// cruces de niveles con velas - entradas pendientes, take profit, stop loss y alertas de precio

import { comparar } from './decimal.mjs';

const tocaArriba = (vela, nivel) => comparar(vela.high, nivel) >= 0;
const tocaAbajo = (vela, nivel) => comparar(vela.low, nivel) <= 0;

// primera vela que alcanza la entrada de una orden pendiente
export function activacionPendiente(operacion, velas) {
  return velas.find(vela => tocaAbajo(vela, operacion.precio_entrada) && tocaArriba(vela, operacion.precio_entrada)) ?? null;
}

// primer cierre de una abierta por tp o sl - si una vela toca los dos gana el sl
export function cierrePorNivel(operacion, velas) {
  const compra = operacion.lado === 'compra';
  const { take_profit: tp, stop_loss: sl } = operacion;
  for (const vela of velas) {
    if (sl != null && (compra ? tocaAbajo(vela, sl) : tocaArriba(vela, sl))) {
      return { motivo_cierre: 'sl', precio_salida: sl, vela };
    }
    if (tp != null && (compra ? tocaArriba(vela, tp) : tocaAbajo(vela, tp))) {
      return { motivo_cierre: 'tp', precio_salida: tp, vela };
    }
  }
  return null;
}

// primera vela que dispara una alerta de nivel - cruza_arriba con el maximo y cruza_abajo con el minimo
export function disparoAlerta(alerta, velas) {
  if (alerta.operador !== 'cruza_arriba' && alerta.operador !== 'cruza_abajo') {
    throw new Error('operador no soportado: ' + String(alerta.operador));
  }
  const toca = alerta.operador === 'cruza_arriba' ? tocaArriba : tocaAbajo;
  return velas.find(vela => toca(vela, alerta.valor)) ?? null;
}
