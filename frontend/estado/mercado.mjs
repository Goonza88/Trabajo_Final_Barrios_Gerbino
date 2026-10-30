import { klines as pedirKlines } from '../../backend/red/binance.mjs';
import { normalizarKlines } from '../../backend/red/normalizar.mjs';

export function crearEstado({ symbol = 'BTCUSDT', interval = '1m', limite = 200, klines = pedirKlines } = {}) {
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
    offsetY: 0,
    precision: false,
    zoomYBeforePrecision: null,
    zoomYSnap: [0.4, 0.5, 0.6, 0.8, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0]
  };

  let carga = 0;
  let abortar = null;

  async function cargar() {
    abortar?.abort();
    const control = new AbortController();
    abortar = control;
    const id = ++carga;
    try {
      const raw = await klines({ symbol: estado.symbol, interval: estado.interval, limit: estado.limite, signal: control.signal });
      if (id !== carga || control.signal.aborted) return estado;
      const norm = normalizarKlines(raw, { exchange_id: estado.exchange_id, symbol: estado.symbol, interval: estado.interval });
      estado.velas = norm.slice(-500);
      const last = estado.velas[estado.velas.length - 1];
      estado.ultimo = last ? last.close : null;
      estado.actualizado_en = Date.now();
      estado.error = null;
      return estado;
    } catch (e) {
      if (id === carga && !control.signal.aborted) estado.error = e.message;
      return estado;
    } finally {
      if (abortar === control) abortar = null;
    }
  }

  function cancelar() {
    carga++;
    abortar?.abort();
    abortar = null;
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
    if (estado.precision) {
      const list = estado.zoomYSnap;
      const idx = list.findIndex(v => Math.abs(v - estado.zoomY) < 1e-6);
      if (dir === '+') {
        const next = idx <= 0 ? 0 : idx - 1;
        estado.zoomY = list[next];
      } else if (dir === '-') {
        const next = idx < 0 ? list.findIndex(v => v >= estado.zoomY) : idx + 1;
        estado.zoomY = list[next >= list.length ? list.length - 1 : next];
      }
      return;
    }
    if (dir === '+') estado.zoomY = Math.max(0.4, estado.zoomY - 0.1);
    if (dir === '-') estado.zoomY = Math.min(3, estado.zoomY + 0.1);
  }

  function mover(dir) {
    if (dir === 'h') estado.offset = Math.min(Math.max(0, estado.velas.length - estado.zoomX), estado.offset + 1);
    if (dir === 'l') estado.offset = Math.max(0, estado.offset - 1);
    if (dir === 'j') estado.offsetY = estado.offsetY + 0.0005;
    if (dir === 'k') estado.offsetY = estado.offsetY - 0.0005;
  }

  return { estado, cargar, setIntervalo, zoomH, zoomV, mover, cancelar };
}