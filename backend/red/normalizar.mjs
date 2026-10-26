export function normalizarKlines(velas, { exchange_id = 'binance', symbol, interval } = {}) {
  if (!Array.isArray(velas)) throw new Error('se espera una lista de velas');
  const ahora = Date.now();
  const out = [];
  for (const v of velas) {
    out.push({
      exchange_id,
      symbol,
      interval,
      open_time: Number(v[0]),
      open: String(v[1]),
      high: String(v[2]),
      low: String(v[3]),
      close: String(v[4]),
      volume: String(v[5]),
      close_time: Number(v[6]),
      quote_volume: String(v[7]),
      trades: v[8] == null ? null : Number(v[8]),
      ingested_at: ahora
    });
  }
  return out;
}