// conector REST de binance - pide velas, tickers de 24h, precios y datos de simbolos

const BASE_URL = 'https://data-api.binance.vision/api/v3';
const TIMEOUT_MS = 10000;

function listaSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new Error('binance: symbols invalido');
  }
  const out = [];
  for (const value of symbols) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error('binance: symbols invalido');
    }
    const symbol = value.trim();
    if (!out.includes(symbol)) out.push(symbol);
  }
  return out;
}

export function crearBinance({ fetch: fetchFn = globalThis.fetch, baseUrl = BASE_URL } = {}) {
  if (typeof fetchFn !== 'function') throw new TypeError('binance: fetch invalido');

  async function pedirJson(path, params, { signal, timeout = TIMEOUT_MS } = {}) {
    const url = new URL(baseUrl + path);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }

    const timeoutSignal = timeout > 0 ? AbortSignal.timeout(timeout) : null;
    const combined = signal && timeoutSignal ? AbortSignal.any([signal, timeoutSignal]) : signal || timeoutSignal;

    let res;
    try {
      res = await fetchFn(url, combined ? { signal: combined } : undefined);
    } catch (error) {
      if (error?.name === 'TimeoutError') throw new Error('binance: timeout');
      throw error;
    }

    const text = await res.text();
    if (!res.ok) throw new Error('binance http ' + res.status + ': ' + text);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('binance: json invalido');
    }
  }

  async function klines({ symbol = 'BTCUSDT', interval = '1m', limit = 100, signal, timeout = TIMEOUT_MS } = {}) {
    return pedirJson('/klines', { symbol, interval, limit }, { signal, timeout });
  }

  async function tickers24h({ symbols = [], signal, timeout = TIMEOUT_MS } = {}) {
    const lista = listaSymbols(symbols);
    return pedirJson('/ticker/24hr', { symbols: JSON.stringify(lista) }, { signal, timeout });
  }

  // ultimo precio de todos los simbolos, tambien de los que ya no operan
  async function precios({ signal, timeout = TIMEOUT_MS } = {}) {
    return pedirJson('/ticker/price', {}, { signal, timeout });
  }

  // datos de un simbolo - binance responde 400 si no existe
  async function infoSimbolo({ symbol, signal, timeout = TIMEOUT_MS } = {}) {
    if (typeof symbol !== 'string' || symbol.trim() === '') throw new Error('binance: symbol invalido');
    try {
      return await pedirJson('/exchangeInfo', { symbol: symbol.trim() }, { signal, timeout });
    } catch (error) {
      if (/^binance http 400/.test(error.message)) throw new Error('simbolo inexistente: ' + symbol.trim());
      throw error;
    }
  }

  return { klines, tickers24h, precios, infoSimbolo };
}

export const { klines, tickers24h, precios, infoSimbolo } = crearBinance();
