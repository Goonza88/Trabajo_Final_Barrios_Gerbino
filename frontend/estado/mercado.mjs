import { cargarVelas as pedirVelas, cargarTickers as pedirTickers } from '../../backend/dominio/mercado.mjs';

export function crearEstado({
  symbol = 'BTCUSDT',
  simbolos = [symbol],
  interval = '1m',
  limite = 200,
  cargarVelas = pedirVelas,
  cargarTickers: cargarTickersFn = pedirTickers
} = {}) {
  const filtrados = Array.isArray(simbolos)
    ? [...new Set(simbolos.filter(s => typeof s === 'string' && s.trim() !== '').map(s => s.trim()))]
    : [];
  const lista = filtrados.length ? filtrados : [symbol];
  const inicial = lista.includes(symbol) ? symbol : lista[0];

  const estado = {
    exchange_id: 'binance',
    symbol: inicial,
    simbolos: lista,
    interval,
    limite,
    velas: [],
    tickers: {},
    tickers_error: null,
    tickers_actualizado_en: null,
    cursor: Math.max(0, lista.indexOf(inicial)),
    foco: 'grafico',
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
  let enCurso = null;
  let cargaTickers = 0;
  let abortarTickers = null;
  let enCursoTickers = null;

  async function ejecutarCarga(control, id) {
    try {
      const norm = await cargarVelas({
        exchange_id: estado.exchange_id,
        symbol: estado.symbol,
        interval: estado.interval,
        limit: estado.limite,
        signal: control.signal
      });
      if (id !== carga || control.signal.aborted) return estado;
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

  function cargar({ reemplazar = true } = {}) {
    if (!reemplazar && enCurso) return enCurso;
    abortar?.abort();
    const control = new AbortController();
    abortar = control;
    const id = ++carga;
    const promesa = ejecutarCarga(control, id);
    enCurso = promesa;
    promesa.finally(() => {
      if (enCurso === promesa) enCurso = null;
    });
    return promesa;
  }

  async function ejecutarCargaTickers(control, id) {
    try {
      const norm = await cargarTickersFn({
        exchange_id: estado.exchange_id,
        symbols: estado.simbolos,
        signal: control.signal
      });
      if (id !== cargaTickers || control.signal.aborted) return estado;
      const mapa = {};
      for (const ticker of norm || []) {
        if (ticker && estado.simbolos.includes(ticker.symbol)) mapa[ticker.symbol] = ticker;
      }
      estado.tickers = mapa;
      estado.tickers_error = null;
      estado.tickers_actualizado_en = Date.now();
      return estado;
    } catch (e) {
      if (id === cargaTickers && !control.signal.aborted) estado.tickers_error = e.message;
      return estado;
    } finally {
      if (abortarTickers === control) abortarTickers = null;
    }
  }

  function cargarTickers({ reemplazar = true } = {}) {
    if (!reemplazar && enCursoTickers) return enCursoTickers;
    abortarTickers?.abort();
    const control = new AbortController();
    abortarTickers = control;
    const id = ++cargaTickers;
    const promesa = ejecutarCargaTickers(control, id);
    enCursoTickers = promesa;
    promesa.finally(() => {
      if (enCursoTickers === promesa) enCursoTickers = null;
    });
    return promesa;
  }

  function cancelar() {
    carga++;
    abortar?.abort();
    abortar = null;
    enCurso = null;
    cargaTickers++;
    abortarTickers?.abort();
    abortarTickers = null;
    enCursoTickers = null;
  }

  async function setIntervalo(i) {
    if (!estado.intervalos.includes(i)) return;
    estado.interval = i;
    estado.velas = [];
    estado.offset = 0;
    estado.offsetY = 0;
    await cargar();
  }

  function moverCursor(delta) {
    if (!estado.simbolos.length) return;
    estado.cursor = Math.max(0, Math.min(estado.simbolos.length - 1, estado.cursor + delta));
  }

  async function seleccionar(symbol) {
    if (!estado.simbolos.includes(symbol)) return estado;
    const cambio = estado.symbol !== symbol;
    estado.symbol = symbol;
    estado.cursor = estado.simbolos.indexOf(symbol);
    if (cambio) {
      estado.velas = [];
      estado.ultimo = null;
      estado.actualizado_en = null;
      estado.error = null;
      estado.offset = 0;
      estado.offsetY = 0;
    }
    return cargar();
  }

  function seleccionarCursor() {
    const symbol = estado.simbolos[estado.cursor];
    return symbol ? seleccionar(symbol) : Promise.resolve(estado);
  }

  function setFoco(foco) {
    if (foco === 'watchlist' || foco === 'grafico') estado.foco = foco;
  }

  function alternarFoco() {
    estado.foco = estado.foco === 'watchlist' ? 'grafico' : 'watchlist';
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

  return {
    estado,
    cargar,
    cargarTickers,
    setIntervalo,
    moverCursor,
    seleccionar,
    seleccionarCursor,
    setFoco,
    alternarFoco,
    zoomH,
    zoomV,
    mover,
    cancelar
  };
}
