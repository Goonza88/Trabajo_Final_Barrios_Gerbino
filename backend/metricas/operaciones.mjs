// metricas del registro de operaciones - pnl, win rate, profit factor, valor esperado y cartera

import { ESCALA, dividir, formatear, multiplicar, parse } from './decimal.mjs';

// pnl escalado a un precio de salida - signo segun lado, menos fees
function pnlEscalado(operacion, salida) {
  if (operacion.lado !== 'compra' && operacion.lado !== 'venta') {
    throw new Error('lado invalido: ' + String(operacion.lado));
  }
  const bruto = (parse(salida) - parse(operacion.precio_entrada)) * parse(operacion.cantidad) / ESCALA;
  return (operacion.lado === 'venta' ? -bruto : bruto) - parse(operacion.fees ?? '0');
}

const sumar = valores => valores.reduce((total, valor) => total + valor, 0n);
const cerradas = operaciones => operaciones.filter(operacion => operacion.estado === 'cerrada');

// pnl de una cerrada, o flotante de una abierta al precio actual - null en el resto
export function pnlOperacion(operacion, precioActual = null) {
  if (operacion.estado === 'cerrada') return formatear(pnlEscalado(operacion, operacion.precio_salida));
  if (operacion.estado === 'abierta' && precioActual != null) return formatear(pnlEscalado(operacion, precioActual));
  return null;
}

// metricas de las cerradas - montos como decimales, proporciones como numeros
export function metricasOperaciones(operaciones) {
  const pnls = cerradas(operaciones).map(operacion => pnlEscalado(operacion, operacion.precio_salida));
  const ganado = sumar(pnls.filter(pnl => pnl > 0n));
  const perdido = -sumar(pnls.filter(pnl => pnl < 0n));
  const total = sumar(pnls);
  return {
    cerradas: pnls.length,
    ganadoras: pnls.filter(pnl => pnl > 0n).length,
    perdedoras: pnls.filter(pnl => pnl < 0n).length,
    pnl_total: formatear(total),
    win_rate: pnls.length ? pnls.filter(pnl => pnl > 0n).length / pnls.length * 100 : null,
    profit_factor: perdido > 0n ? Number(ganado) / Number(perdido) : null,
    valor_esperado: pnls.length ? formatear(total / BigInt(pnls.length)) : null,
  };
}

// saldo con lo realizado, flotante de las abiertas y patrimonio - precios por simbolo
export function resumenCartera(saldoInicial, operaciones, precios = {}) {
  const saldo = parse(saldoInicial) + sumar(cerradas(operaciones).map(operacion => pnlEscalado(operacion, operacion.precio_salida)));
  const flotante = sumar(operaciones
    .filter(operacion => operacion.estado === 'abierta' && precios[operacion.symbol] != null)
    .map(operacion => pnlEscalado(operacion, precios[operacion.symbol])));
  return { saldo: formatear(saldo), flotante: formatear(flotante), patrimonio: formatear(saldo + flotante) };
}

// cantidad que compra un porcentaje del saldo al precio de entrada, truncada
export function cantidadPorPorcentaje(saldo, porcentaje, precio) {
  const monto = dividir(formatear(multiplicar(saldo, porcentaje)), '100');
  return formatear(dividir(formatear(monto), precio));
}
