import { klines } from '../../backend/red/binance.mjs';
import { normalizarKlines } from '../../backend/red/normalizar.mjs';

export function crearEstado({ symbol = 'BTCUSDT', interval = '1m', limite = 100 } = {}) {
  const estado = {
    exchange_id: 'binance',
    symbol,
    interval,
    limite,
    velas: [],
    error: null,
    ultimo: null
  };

  async function cargar() {
    try {
      const raw = await klines({ symbol: estado.symbol, interval: estado.interval, limit: estado.limite });
      const norm = normalizarKlines(raw, { exchange_id: estado.exchange_id, symbol: estado.symbol, interval: estado.interval });
      estado.velas = norm.slice(-200);
      const last = estado.velas[estado.velas.length - 1];
      estado.ultimo = last ? last.close : null;
      estado.error = null;
      return estado;
    } catch (e) {
      estado.error = e.message;
      return estado;
    }
  }

  return { estado, cargar };
}