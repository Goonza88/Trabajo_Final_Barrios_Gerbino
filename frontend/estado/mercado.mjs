import { klines } from '../../backend/red/binance.mjs';
import { normalizarKlines } from '../../backend/red/normalizar.mjs';

export function crearEstado({ symbol = 'BTCUSDT', interval = '1m', limite = 200 } = {}) {
  const estado = {
    exchange_id: 'binance',
    symbol,
    interval,
    limite,
    velas: [],
    error: null,
    ultimo: null,
    actualizado_en: null,
    intervalos: ['1m', '5m', '1h', '4h', '1d'],
    zoomX: 80,
    zoomY: 1.0,
    offset: 0,
    offsetY: 0
  };

  async function cargar() {
    try {
      const raw = await klines({ symbol: estado.symbol, interval: estado.interval, limit: estado.limite });
      const norm = normalizarKlines(raw, { exchange_id: estado.exchange_id, symbol: estado.symbol, interval: estado.interval });
      estado.velas = norm.slice(-500);
      const last = estado.velas[estado.velas.length - 1];
      estado.ultimo = last ? last.close : null;
      estado.actualizado_en = Date.now();
      estado.error = null;
      return estado;
    } catch (e) {
      estado.error = e.message;
      return estado;
    }
  }

  async function setIntervalo(i) {
    if (!estado.intervalos.includes(i)) return;
    estado.interval = i;
    estado.velas = [];
    estado.offset = 0;
    estado.offsetY = 0;
    await cargar();
  }

  function zoomH(dir) {
    if (dir === '+') estado.zoomX = Math.max(20, estado.zoomX - 5);
    if (dir === '-') estado.zoomX = Math.min(160, estado.zoomX + 5);
  }

  function zoomV(dir) {
    if (dir === '+') estado.zoomY = Math.max(0.4, estado.zoomY - 0.1);
    if (dir === '-') estado.zoomY = Math.min(3, estado.zoomY + 0.1);
  }

  function mover(dir) {
    if (dir === 'h') estado.offset = Math.min(Math.max(0, estado.velas.length - estado.zoomX), estado.offset + 1);
    if (dir === 'l') estado.offset = Math.max(0, estado.offset - 1);
    if (dir === 'j') estado.offsetY = estado.offsetY + 0.0005;
    if (dir === 'k') estado.offsetY = estado.offsetY - 0.0005;
  }

  return { estado, cargar, setIntervalo, zoomH, zoomV, mover };
}