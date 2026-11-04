// casos de uso de alertas de nivel - eligen cruce segun precio y deciden cuando se disparan

import { comparar } from '../metricas/decimal.mjs';
import { disparoAlerta } from '../metricas/niveles.mjs';
import { tramosDesde } from './operaciones.mjs';

// alerta en un nivel, con forma de la fila del contrato sin id
export function crearAlerta({ exchange_id, symbol, valor, precio, timeframe, ahora }) {
  const lado = comparar(valor, precio);
  if (lado === 0) throw new Error('la alerta esta en el precio actual');
  return {
    exchange_id,
    symbol,
    tipo: 'precio',
    campo: 'price',
    operador: lado > 0 ? 'cruza_arriba' : 'cruza_abajo',
    valor,
    timeframe,
    activa: 1,
    disparada: 0,
    ultimo_disparo: null,
    disparos: 0,
    note: null,
    created_at: ahora,
    updated_at: ahora,
  };
}

// dispara alertas activas del simbolo que cruzan su nivel y las apaga - devuelve lista nueva y eventos
export function seguirAlertas(alertas, { symbol, velas, precio = null, ahora }) {
  const eventos = [];
  const siguientes = alertas.map(alerta => {
    if (alerta.symbol !== symbol || !alerta.activa) return alerta;
    if (!disparoAlerta(alerta, tramosDesde(velas, alerta.created_at, precio, ahora))) return alerta;
    const disparada = { ...alerta, activa: 0, disparada: 1, disparos: alerta.disparos + 1, ultimo_disparo: ahora, updated_at: ahora };
    eventos.push({ tipo: 'alerta', alerta: disparada });
    return disparada;
  });
  return { alertas: siguientes, eventos };
}
