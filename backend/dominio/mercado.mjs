// casos de uso de mercado - coordina conectores y normalizacion, sin calcular indicadores

import { klines } from '../red/binance.mjs';
import { normalizarKlines } from '../red/normalizar.mjs';

const CONECTORES = { binance: klines };

export function crearCargarVelas({ conectores = CONECTORES, normalizar = normalizarKlines } = {}) {
  return async function cargarVelas({ exchange_id = 'binance', symbol, interval, limit, signal } = {}) {
    const pedir = conectores[exchange_id];
    if (!pedir) throw new Error('exchange no soportado: ' + exchange_id);

    const raw = await pedir({ symbol, interval, limit, signal });
    return normalizar(raw, { exchange_id, symbol, interval });
  };
}

export const cargarVelas = crearCargarVelas();
