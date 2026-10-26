const BASE_URL = 'https://data-api.binance.vision/api/v3/klines';

export async function klines({ symbol = 'BTCUSDT', interval = '1m', limit = 100 } = {}) {
  const url = new URL(BASE_URL);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', interval);
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error('binance http ' + res.status + ': ' + text);

  return JSON.parse(text);
}