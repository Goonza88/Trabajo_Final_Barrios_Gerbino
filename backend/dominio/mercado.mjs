// casos de uso de mercado - coordina conectores y normalizacion, sin calcular indicadores

import { klines, tickers24h } from '../red/binance.mjs';
import { normalizarKlines, normalizarTickers } from '../red/normalizar.mjs';

const CONECTORES_VELAS = { binance: klines };
const CONECTORES_TICKERS = { binance: tickers24h };

function symbolsValidos(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('symbols invalido');
  }
  const lista = [];
  for (const valor of symbols) {
    if (typeof valor !== 'string' || valor.trim() === '') {
      throw new Error('symbols invalido');
    }
    const symbol = valor.trim();
    if (!lista.includes(symbol)) lista.push(symbol);
  }
  return lista;
}

export function crearCargarVelas({ conectores = CONECTORES_VELAS, normalizar = normalizarKlines } = {}) {
  return async function cargarVelas({ exchange_id = 'binance', symbol, interval, limit, signal } = {}) {
    const pedir = conectores[exchange_id];
    if (!pedir) throw new Error('exchange no soportado: ' + exchange_id);

    const raw = await pedir({ symbol, interval, limit, signal });
    return normalizar(raw, { exchange_id, symbol, interval });
  };
}

export function crearCargarTickers({ conectores = CONECTORES_TICKERS, normalizar = normalizarTickers } = {}) {
  return async function cargarTickers({ exchange_id = 'binance', symbols, signal } = {}) {
    const pedir = conectores[exchange_id];
    if (!pedir) throw new Error('exchange no soportado: ' + exchange_id);

    const lista = symbolsValidos(symbols);
    const raw = await pedir({ symbols: lista, signal });
    return normalizar(raw, { exchange_id });
  };
}

export const cargarVelas = crearCargarVelas();
export const cargarTickers = crearCargarTickers();
