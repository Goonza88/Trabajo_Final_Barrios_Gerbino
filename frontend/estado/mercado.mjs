// estado de sesion de mercado - simbolo, intervalo, watchlist, vista y cargas en segundo plano

import { cargarVelas as pedirVelas, cargarTickers as pedirTickers } from '../../backend/dominio/mercado.mjs';
import { calcularIndicadores, calcularVariacion } from '../../backend/dominio/indicadores.mjs';

// limites del zoom horizontal, en velas visibles
const ZOOM_X = Object.freeze({ min: 20, max: 160, paso: 5 });

// limites del zoom vertical, en veces el rango de precios
const ZOOM_Y = Object.freeze({ min: 0.4, max: 3.0, paso: 0.1 });

// orden sin confirmar - tipo y niveles marcados desde la mira
const NIVELES_BORRADOR = ['entrada', 'take_profit', 'stop_loss'];
const borradorVacio = () => ({ tipo: 'mercado', entrada: null, take_profit: null, stop_loss: null });

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
    modoTabla: false,
    mira: null,
    modoMira: false,
    borrador: borradorVacio(),
    indicadores: { sma: false, ema: false, rsi: false, volume: false, bollinger: true }
  };

  // carga en segundo plano - nueva cancela anterior y una respuesta vieja no pisa nueva
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

    // reemplazar false usa request en curso
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
      estado.borrador = borradorVacio();
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
    if (dir === '+') estado.zoomY = Math.max(ZOOM_Y.min, estado.zoomY - ZOOM_Y.paso);
    if (dir === '-') estado.zoomY = Math.min(ZOOM_Y.max, estado.zoomY + ZOOM_Y.paso);
  }

  // celda bajo el click, null al soltar
  function setMira(mira) {
    estado.mira = mira;
  }

  // modo teclado - la mira queda fija hasta apagarlo
  function alternarModoMira() {
    estado.modoMira = !estado.modoMira;
    if (!estado.modoMira) estado.mira = null;
  }

  function fijarNivel(campo, precio) {
    if (NIVELES_BORRADOR.includes(campo)) estado.borrador[campo] = precio;
  }

  function alternarTipoOrden() {
    estado.borrador.tipo = estado.borrador.tipo === 'mercado' ? 'limite' : 'mercado';
  }

  function descartarBorrador() {
    estado.borrador = borradorVacio();
  }

  function alternarTabla() {
    estado.modoTabla = !estado.modoTabla;
  }

  // al volver a entrar a la vista arranca en el grafico
  function reiniciarVista() {
    estado.modoTabla = false;
    estado.modoMira = false;
    estado.mira = null;
  }

  function mover(dir, cantidadVisible = estado.zoomX) {
    if (dir === 'h' || dir === 'l') {
      const visible = Number.isFinite(cantidadVisible)
        ? Math.max(1, Math.floor(cantidadVisible))
        : Math.max(1, estado.zoomX);
      const maxOffset = Math.max(0, estado.velas.length - visible);
      // offset negativo deja lugares vacios a la derecha, siempre queda al menos una vela
      const minOffset = -(visible - 1);
      const actual = Math.max(minOffset, Math.min(maxOffset, estado.offset));
      estado.offset = dir === 'h'
        ? Math.min(maxOffset, actual + 1)
        : Math.max(minOffset, actual - 1);
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
    alternarTabla,
    setMira,
    alternarModoMira,
    fijarNivel,
    alternarTipoOrden,
    descartarBorrador,
    reiniciarVista,
    mover,
    cancelar
  };
}
