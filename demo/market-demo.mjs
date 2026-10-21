// demo de mercado - consulta una vela 1m de Binance para BTCUSDT y ETHUSDT y la pinta
// q sale - si falla la red se muestra el error en pantalla y la app sigue andando

import { setPalette } from '../backend/terminal/ansi.mjs';
import { PALETA } from '../frontend/paleta.mjs';
import { run, quit, Sub, size } from '../backend/terminal/runtime.mjs';
import { box, rows, text, gap } from '../backend/terminal/widgets.mjs';

// los demos usan la paleta del proyecto, igual que la app
setPalette(PALETA);

const BASE_URL = 'https://data-api.binance.vision/api/v3/klines';
const SYMBOLS = ['BTCUSDT', 'ETHUSDT'];

// pedimos una vela para probar OHLCV sin traer el historial que todavia no usamos
const KLINE_INTERVAL = '1m';
const POLL_INTERVAL_MS = Number(process.env.MARKET_POLL_INTERVAL_MS ?? 5_000);

if (!Number.isFinite(POLL_INTERVAL_MS) || POLL_INTERVAL_MS <= 0) {
  throw new Error('MARKET_POLL_INTERVAL_MS must be a positive number.');
}

// una vuelta de consultas en paralelo
async function pedir() {
  return Promise.all(SYMBOLS.map(async (symbol) => {
    const url = new URL(BASE_URL);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', KLINE_INTERVAL);
    url.searchParams.set('limit', '1');

    try {
      const response = await fetch(url);
      const payload = await response.text();

      if (!response.ok) return { ok: false, s: `${symbol} HTTP ${response.status}: ${payload}` };
      return { ok: true, s: `${symbol} ${payload}` };
    } catch (error) {
      return { ok: false, s: `${symbol} request failed: ${error.message}` };
    }
  }));
}

run({
  // init no espera a la respuesta de red
  init: () => ({ lineas: [], hora: null }),

  subscriptions: [Sub.timeout(0, 'cargar'), Sub.interval(POLL_INTERVAL_MS, 'vuelta')],

  update: async (model, event) => {
    if (event.type === 'key' && event.key === 'q') quit();
    if (event.type === 'sub:tick' && (event.tag === 'cargar' || event.tag === 'vuelta')) {
      return { lineas: await pedir(), hora: new Date() };
    }
    return model;
  },

  view: (model) => box(rows([
    gap(1),
    text('binance klines 1m', { fg: 'accent', bold: true }),
    gap(),
    ...(model.lineas.length
      ? model.lineas.map(l => text(l.s, { fg: l.ok ? 'text' : 'danger' }))
      : [text('esperando respuesta de la api...', { fg: 'muted' })]),
    gap(),
    text(model.hora ? `ultima consulta ${model.hora.toLocaleTimeString('es-AR')}` : 'cargando...', { fg: 'muted' }),
    text(`refresco cada ${POLL_INTERVAL_MS} ms`, { fg: 'muted' }),
    gap(),
    text('q salir', { fg: 'sec' }),
  ]), { border: 'round', pad: [0, 1], height: size().rows }),
});