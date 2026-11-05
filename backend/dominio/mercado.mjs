// casos de uso de mercado - coordina conectores y normalizacion, sin calcular indicadores

import { infoSimbolo, klines, precios, tickers24h } from '../red/binance.mjs';
import { normalizarKlines, normalizarPrecios, normalizarSimbolo, normalizarTickers } from '../red/normalizar.mjs';

const CONECTORES_VELAS = { binance: klines };
const CONECTORES_TICKERS = { binance: tickers24h };
const CONECTORES_PRECIOS = { binance: precios };
const CONECTORES_SIMBOLO = { binance: infoSimbolo };

// maximo de resultados del buscador
const MAX_RESULTADOS = 50;

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

// guardar recibe lo normalizado, para persistirlo antes de entregarlo
export function crearCargarVelas({ conectores = CONECTORES_VELAS, normalizar = normalizarKlines, guardar = null } = {}) {
  return async function cargarVelas({ exchange_id = 'binance', symbol, interval, limit, signal } = {}) {
    const pedir = conectores[exchange_id];
    if (!pedir) throw new Error('exchange no soportado: ' + exchange_id);

    const raw = await pedir({ symbol, interval, limit, signal });
    const velas = normalizar(raw, { exchange_id, symbol, interval });
    guardar?.(velas);
    return velas;
  };
}

export function crearCargarTickers({ conectores = CONECTORES_TICKERS, normalizar = normalizarTickers, guardar = null } = {}) {
  return async function cargarTickers({ exchange_id = 'binance', symbols, signal } = {}) {
    const pedir = conectores[exchange_id];
    if (!pedir) throw new Error('exchange no soportado: ' + exchange_id);

    const lista = symbolsValidos(symbols);
    const raw = await pedir({ symbols: lista, signal });
    const tickers = normalizar(raw, { exchange_id });
    guardar?.(tickers);
    return tickers;
  };
}

// simbolos del exchange con su ultimo precio - sin los que ya no operan
export function crearCargarSimbolos({ conectores = CONECTORES_PRECIOS, normalizar = normalizarPrecios } = {}) {
  return async function cargarSimbolos({ exchange_id = 'binance', signal } = {}) {
    const pedir = conectores[exchange_id];
    if (!pedir) throw new Error('exchange no soportado: ' + exchange_id);
    return normalizar(await pedir({ signal }), { exchange_id }).filter(simbolo => Number(simbolo.price) > 0);
  };
}

// datos de un simbolo antes de sumarlo - tiene que existir y poder operarse
export function crearValidarSimbolo({ conectores = CONECTORES_SIMBOLO, normalizar = normalizarSimbolo } = {}) {
  return async function validarSimbolo({ exchange_id = 'binance', symbol, signal } = {}) {
    const pedir = conectores[exchange_id];
    if (!pedir) throw new Error('exchange no soportado: ' + exchange_id);
    const simbolo = normalizar(await pedir({ symbol, signal }), { exchange_id });
    if (!simbolo.operable) throw new Error('simbolo sin operar: ' + simbolo.symbol);
    return simbolo;
  };
}

// simbolos que coinciden con busqueda, ordenada por cercania
export function buscarSimbolos(simbolos, texto) {
  const buscado = String(texto ?? '').trim().toUpperCase();
  if (!buscado) return [];
  const orden = ({ symbol }) => [
    symbol === buscado ? 0 : symbol.startsWith(buscado) ? 1 : 2,
    symbol.endsWith('USDT') ? 0 : 1,
  ];
  return simbolos
    .filter(({ symbol }) => symbol.includes(buscado))
    .sort((a, b) => {
      const [ga, qa] = orden(a), [gb, qb] = orden(b);
      return ga - gb || qa - qb || a.symbol.localeCompare(b.symbol);
    })
    .slice(0, MAX_RESULTADOS);
}

export const cargarVelas = crearCargarVelas();
export const cargarTickers = crearCargarTickers();
export const cargarSimbolos = crearCargarSimbolos();
export const validarSimbolo = crearValidarSimbolo();
