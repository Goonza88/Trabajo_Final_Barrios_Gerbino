// estado de sesion de mercado - simbolo, intervalo, watchlist, vista y cargas en segundo plano

import { abrirRegistro } from '../../backend/dominio/registro.mjs';
import { calcularIndicadores, calcularVariacion } from '../../backend/dominio/indicadores.mjs';
import { crearPractica } from './operaciones.mjs';
import { crearAlertas } from './alertas.mjs';
import { crearBuscador } from './buscador.mjs';

// limites del zoom horizontal, en velas visibles
const ZOOM_X = Object.freeze({ min: 20, max: 160, paso: 5 });

// limites del zoom vertical, en veces el rango de precios
const ZOOM_Y = Object.freeze({ min: 0.4, max: 3.0, paso: 0.1 });

export function crearEstado({
  symbol = 'BTCUSDT',
  simbolos = [symbol],
  interval = '1m',
  limite = 200,
  cargarVelas,
  cargarTickers: cargarTickersFn,
  cargarSimbolos,
  validarSimbolo,
  saldoInicial = '100',
  porcentaje,
  ahora = Date.now,
  // sin registro la sesion usa una base en memoria
  registro = abrirRegistro({ path: ':memory:', ahora })
} = {}) {
  cargarVelas ??= registro.mercado.cargarVelas;
  cargarTickersFn ??= registro.mercado.cargarTickers;
  cargarSimbolos ??= registro.mercado.cargarSimbolos;
  validarSimbolo ??= registro.mercado.validarSimbolo;
  const filtrados = Array.isArray(simbolos)
    ? [...new Set(simbolos.filter(s => typeof s === 'string' && s.trim() !== '').map(s => s.trim()))]
    : [];
  // lo guardado de sesiones anteriores manda sobre lo que llega
  const sesion = registro.cargarSesion({ simbolos: filtrados.length ? filtrados : [symbol], symbol, interval, saldo_inicial: saldoInicial });
  const lista = sesion.simbolos.length ? sesion.simbolos : [symbol];
  const inicial = lista.includes(sesion.symbol) ? sesion.symbol : lista[0];

  const estado = {
    exchange_id: 'binance',
    symbol: inicial,
    simbolos: lista,
    interval: sesion.interval,
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
    modoDiario: false,
    cargando: false,
    mira: null,
    modoMira: false,
    indicadores: { sma: false, ema: false, rsi: false, volume: false, bollinger: true }
  };

  const practica = crearPractica(estado, { saldoInicial: sesion.saldo_inicial, porcentaje, ahora, registro, operaciones: sesion.operaciones });
  const alertas = crearAlertas(estado, { ahora, registro, alertas: sesion.alertas });

  // un cambio que no se pudo guardar queda como error de orden - devuelve si se guardo
  function guardar(accion) {
    try {
      accion();
      return true;
    } catch (e) {
      estado.error_orden = { mensaje: e.message, en: ahora() };
      return false;
    }
  }

  const guardarPreferencias = () => guardar(() => registro.guardarPreferencias({
    symbol: estado.symbol,
    interval: estado.interval,
    saldo_inicial: estado.saldo_inicial,
  }));

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
      practica.seguir(estado.symbol, norm, norm.at(-1)?.close ?? null);
      alertas.seguir(estado.symbol, norm, norm.at(-1)?.close ?? null);
    },
    e => { estado.error = e.message; }
  );

  const seguidos = () => [...new Set([
    ...estado.simbolos,
    ...estado.operaciones.filter(operacion => operacion.estado === 'abierta' || operacion.estado === 'pendiente').map(operacion => operacion.symbol),
    ...estado.alertas.filter(alerta => alerta.activa).map(alerta => alerta.symbol),
  ])];

  const tickers = crearCarga(
    signal => cargarTickersFn({
      exchange_id: estado.exchange_id,
      symbols: seguidos(),
      signal
    }),
    norm => {
      const previos = estado.tickers;
      const mapa = {};
      const variaciones = {};
      for (const ticker of norm || []) {
        if (!ticker || !seguidos().includes(ticker.symbol)) continue;
        mapa[ticker.symbol] = ticker;
        variaciones[ticker.symbol] = calcularVariacion(ticker);
      }
      estado.tickers = mapa;
      estado.variaciones = variaciones;
      // las de otros simbolos siguen con el precio del ticker
      for (const ticker of Object.values(mapa)) {
        if (ticker.symbol === estado.symbol) continue;
        const [low, high] = [previos[ticker.symbol]?.price ?? ticker.price, ticker.price].sort((a, b) => Number(a) - Number(b));
        const tramo = [{ open_time: ahora(), low, high }];
        practica.seguir(ticker.symbol, tramo, null);
        alertas.seguir(ticker.symbol, tramo, null);
      }
      estado.tickers_error = null;
      estado.tickers_actualizado_en = Date.now();
    },
    e => { estado.tickers_error = e.message; }
  );

  const cargar = velas.cargar;
  const cargarTickers = tickers.cargar;
  const buscador = crearBuscador(estado, { cargarSimbolos, validarSimbolo, agregarSimbolo });

  function cancelar() {
    velas.cancelar();
    tickers.cancelar();
  }

  async function setIntervalo(i) {
    if (!estado.intervalos.includes(i)) return;
    estado.interval = i;
    guardarPreferencias();
    estado.velas = [];
    estado.offset = 0;
    estado.offsetY = 0;
    await cargar();
  }

  // el cursor llega hasta agregar, despues del ultimo simbolo
  function moverCursor(delta) {
    estado.cursor = Math.max(0, Math.min(estado.simbolos.length, estado.cursor + delta));
  }

  // suma un simbolo a watchlist, lo deja elegido y pide su ticker - info trae base y quote del exchange
  function agregarSimbolo(symbol, info) {
    if (!estado.simbolos.includes(symbol)) {
      registro.agregarSimbolo(symbol, info);
      estado.simbolos = [...estado.simbolos, symbol];
    }
    estado.cursor = estado.simbolos.indexOf(symbol);
    return cargarTickers();
  }

  // quita el simbolo - siempre queda al menos uno
  function quitarSimbolo() {
    const symbol = estado.simbolos[estado.cursor];
    if (!symbol || estado.simbolos.length === 1) return Promise.resolve(estado);
    if (!guardar(() => registro.quitarSimbolo(symbol))) return Promise.resolve(estado);
    estado.simbolos = estado.simbolos.filter(actual => actual !== symbol);
    delete estado.tickers[symbol];
    delete estado.variaciones[symbol];
    estado.cursor = Math.min(estado.cursor, estado.simbolos.length - 1);
    if (symbol !== estado.symbol) return Promise.resolve(estado);
    return seleccionar(estado.simbolos[estado.cursor]);
  }

  async function seleccionar(symbol) {
    if (!estado.simbolos.includes(symbol)) return estado;
    const cambio = estado.symbol !== symbol;
    estado.symbol = symbol;
    estado.cursor = estado.simbolos.indexOf(symbol);
    if (cambio) {
      guardarPreferencias();
      practica.descartarBorrador();
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
    if (['watchlist', 'grafico', 'orden', 'aviso'].includes(foco)) estado.foco = foco;
  }

  // pasa al siguiente de los focos disponibles
  function alternarFoco(focos = ['watchlist', 'grafico']) {
    estado.foco = focos[(focos.indexOf(estado.foco) + 1) % focos.length];
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

  // tabla y diario ocupan el lugar del grafico, uno a la vez
  function alternarTabla() {
    estado.modoTabla = !estado.modoTabla;
    estado.modoDiario = false;
  }

  function alternarDiario() {
    estado.modoDiario = !estado.modoDiario;
    estado.modoTabla = false;
  }

  // al volver a entrar a la vista arranca en el grafico
  function reiniciarVista() {
    estado.error_orden = null;
    estado.modoTabla = false;
    estado.modoDiario = false;
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
    fijarNivel: practica.fijarNivel,
    fijarEntrada: practica.fijarEntrada,
    descartarBorrador: practica.descartarBorrador,
    confirmarBorrador: practica.confirmarBorrador,
    cambiarPorcentaje: practica.cambiarPorcentaje,
    alternarDiario,
    moverDiario: practica.moverDiario,
    cerrarSeleccionada: practica.cerrarSeleccionada,
    cancelarSeleccionada: practica.cancelarSeleccionada,
    empezarNotas: practica.empezarNotas,
    teclearNotas: practica.teclearNotas,
    agregarSimbolo,
    quitarSimbolo,
    abrirBuscador: buscador.abrirBuscador,
    teclearBuscador: buscador.teclearBuscador,
    agregarAlerta: alertas.agregarAlerta,
    descartarAviso: alertas.descartarAviso,
    borrarAlertaSeleccionada: alertas.borrarAlertaSeleccionada,
    reiniciarVista,
    mover,
    cancelar
  };
}
