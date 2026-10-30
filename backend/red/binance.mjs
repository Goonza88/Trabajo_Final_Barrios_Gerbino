const BASE_URL = 'https://data-api.binance.vision/api/v3/klines';
const TIMEOUT_MS = 10000;

export async function klines({ symbol = 'BTCUSDT', interval = '1m', limit = 100, signal, timeout = TIMEOUT_MS } = {}) {
  const url = new URL(BASE_URL);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('limit', String(limit));

  const timeoutSignal = timeout > 0 ? AbortSignal.timeout(timeout) : null;
  const combined = signal && timeoutSignal ? AbortSignal.any([signal, timeoutSignal]) : signal || timeoutSignal;

  let res;
  try {
    res = await fetch(url, combined ? { signal: combined } : undefined);
  } catch (error) {
    if (error?.name === 'TimeoutError') throw new Error('binance: timeout');
    throw error;
  }
  const text = await res.text();
  if (!res.ok) throw new Error('binance http ' + res.status + ': ' + text);

  return JSON.parse(text);
}