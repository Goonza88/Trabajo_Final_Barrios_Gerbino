// estado de sesion de mercado - simbolo, intervalo, watchlist, vista y cargas en segundo plano

import { cargarVelas as pedirVelas, cargarTickers as pedirTickers } from '../../backend/dominio/mercado.mjs';
import { calcularIndicadores, calcularVariacion } from '../../backend/dominio/indicadores.mjs';

// limites del zoom horizontal, en velas visibles
const ZOOM_X = Object.freeze({ min: 20, max: 160, paso: 5 });

// zoom vertical - paso libre y pasos de precision, sus extremos son los limites
const ZOOM_Y = Object.freeze({ paso: 0.1, pasos: Object.freeze([0.4, 0.5, 0.6, 0.8, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0]) });
const ZOOM_Y_MIN = ZOOM_Y.pasos[0];
const ZOOM_Y_MAX = ZOOM_Y.pasos.at(-1);

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
    series: calcularIndicadores([]),
    tickers: {},
    variaciones: {},
    tickers_error: null,
    tickers_actualizado_en: null,
    cursor: Math.max(0, lista.indexOf(inicial)),
    foco: 'grafico',
    error: null,
    actualizado_en: null,
    intervalos: ['1m', '5m', '1h', '4h', '1d'],
    zoomX: 80,
    zoomY: 1.0,
    offset: 0,
    offsetY: 0,
    precision: false,
    modoTabla: false,
    indicadores: { sma: false, ema: false, rsi: false, volume: false, bollinger: true },
    zoomYBeforePrecision: null
  };

  // carga en segundo plano - la nueva cancela a la anterior y una respuesta vieja no pisa a la nueva
  // con reemplazar en false reusa la que esta en curso
  function crearCarga(pedir, aplicar, fallar) {
    let ultima = 0;
    let abortar = null;
    let enCurso = null;

    async function ejecutar(control, id) {
      const vigente = () => id === ultima && !control.signal.aborted;
      try {
        const datos = await pedir(control.signal);
        if (vigente()) aplicar(datos);
      } catch (e) {
        if (vigente()) fallar(e);
      } finally {
        if (abortar === control) abortar = null;
      }
      return estado;
    }

    function cargar({ reemplazar = true } = {}) {
      if (!reemplazar && enCurso) return enCurso;
      abortar?.abort();
      const control = new AbortController();
      abortar = control;
      const promesa = ejecutar(control, ++ultima);
      enCurso = promesa;
      promesa.finally(() => {
        if (enCurso === promesa) enCurso = null;
      });
      return promesa;
    }

    function cancelar() {
      ultima++;
      abortar?.abort();
      abortar = null;
      enCurso = null;
    }

    return { cargar, cancelar };
  }

  const velas = crearCarga(
    signal => cargarVelas({
      exchange_id: estado.exchange_id,
      symbol: estado.symbol,
      interval: estado.interval,
      limit: estado.limite,
      signal
    }),
    norm => {
      estado.velas = norm;
      estado.series = calcularIndicadores(norm);
      estado.actualizado_en = Date.now();
      estado.error = null;
    },
    e => { estado.error = e.message; }
  );

  const tickers = crearCarga(
    signal => cargarTickersFn({
      exchange_id: estado.exchange_id,
      symbols: estado.simbolos,
      signal
    }),
    norm => {
      const mapa = {};
      const variaciones = {};
      for (const ticker of norm || []) {
        if (!ticker || !estado.simbolos.includes(ticker.symbol)) continue;
        mapa[ticker.symbol] = ticker;
        variaciones[ticker.symbol] = calcularVariacion(ticker);
      }
      estado.tickers = mapa;
      estado.variaciones = variaciones;
      estado.tickers_error = null;
      estado.tickers_actualizado_en = Date.now();
    },
    e => { estado.tickers_error = e.message; }
  );

  const cargar = velas.cargar;
  const cargarTickers = tickers.cargar;

  function cancelar() {
    velas.cancelar();
    tickers.cancelar();
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

  function alternarIndicador(nombre) {
    if (Object.hasOwn(estado.indicadores, nombre)) {
      estado.indicadores[nombre] = !estado.indicadores[nombre];
    }
  }

  // maxVisible es lo que entra en pantalla - sin limite de pantalla rige ZOOM_X.max
  function zoomH(dir, maxVisible = Infinity) {
    const upper = Math.max(ZOOM_X.min, Math.min(ZOOM_X.max, Math.floor(maxVisible)));
    const actual = Math.max(ZOOM_X.min, Math.min(estado.zoomX, upper));
    if (dir === '+') estado.zoomX = Math.max(ZOOM_X.min, actual - ZOOM_X.paso);
    if (dir === '-') estado.zoomX = Math.min(upper, actual + ZOOM_X.paso);
  }

  function zoomV(dir) {
    if (estado.precision) {
      const list = ZOOM_Y.pasos;
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
    if (dir === '+') estado.zoomY = Math.max(ZOOM_Y_MIN, estado.zoomY - ZOOM_Y.paso);
    if (dir === '-') estado.zoomY = Math.min(ZOOM_Y_MAX, estado.zoomY + ZOOM_Y.paso);
  }

  // la precision fija el zoom vertical al paso mas cercano y al salir vuelve al zoom previo
  function alternarPrecision() {
    if (estado.precision) {
      if (estado.zoomYBeforePrecision != null) estado.zoomY = estado.zoomYBeforePrecision;
      estado.zoomYBeforePrecision = null;
      estado.precision = false;
      return;
    }
    estado.zoomYBeforePrecision = estado.zoomY;
    estado.precision = true;
    estado.zoomY = ZOOM_Y.pasos.reduce((mejor, paso) =>
      Math.abs(paso - estado.zoomY) < Math.abs(mejor - estado.zoomY) ? paso : mejor);
  }

  function alternarTabla() {
    estado.modoTabla = !estado.modoTabla;
  }

  // al volver a entrar a la vista arranca en el grafico
  function reiniciarVista() {
    estado.modoTabla = false;
  }

  function mover(dir, cantidadVisible = estado.zoomX) {
    if (dir === 'h' || dir === 'l') {
      const visible = Number.isFinite(cantidadVisible)
        ? Math.max(1, Math.floor(cantidadVisible))
        : Math.max(1, estado.zoomX);
      const maxOffset = Math.max(0, estado.velas.length - visible);
      const actual = Math.max(0, Math.min(maxOffset, estado.offset));
      estado.offset = dir === 'h'
        ? Math.min(maxOffset, actual + 1)
        : Math.max(0, actual - 1);
    }
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
    alternarIndicador,
    zoomH,
    zoomV,
    alternarPrecision,
    alternarTabla,
    reiniciarVista,
    mover,
    cancelar
  };
}
