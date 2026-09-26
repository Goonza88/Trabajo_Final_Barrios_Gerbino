const BASE_URL = 'https://data-api.binance.vision/api/v3/klines';
const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];
// pedimos una vela para probar OHLCV sin traer historial que todavia no usamos
const KLINE_INTERVAL = '1m';
const POLL_INTERVAL_MS = Number(process.env.MARKET_POLL_INTERVAL_MS ?? 5_000);

if (!Number.isFinite(POLL_INTERVAL_MS) || POLL_INTERVAL_MS <= 0) {
  throw new Error('MARKET_POLL_INTERVAL_MS must be a positive number.');
}

async function printMarketData(symbol) {
  const url = new URL(BASE_URL);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('interval', KLINE_INTERVAL);
  url.searchParams.set('limit', '1');

  try {
    const response = await fetch(url);
    const payload = await response.text();

    if (!response.ok) {
      console.error(`${symbol} HTTP ${response.status}: ${payload}`);
      return;
    }

    console.log(`${symbol} ${payload}`);
  } catch (error) {
    console.error(`${symbol} request failed: ${error.message}`);
  }
}

async function poll() {
  for (const symbol of SYMBOLS) {
    await printMarketData(symbol);
  }

  // espera a que terminen las consultas antes de arrancar la siguiente vuelta
  setTimeout(poll, POLL_INTERVAL_MS);
}

console.log(`Polling Binance klines every ${POLL_INTERVAL_MS} ms. Press Ctrl+C to stop.`);
poll();
