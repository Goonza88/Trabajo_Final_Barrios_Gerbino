// persistencia de la sesion - abre la capa de datos, carga lo guardado y guarda cada cambio de la app

import { createData } from '../datos/sqlite/index.mjs';
import { INTERVALS } from '../datos/contrato/types.mjs';
import { crearBinance } from '../red/binance.mjs';
import { crearCargarSimbolos, crearCargarTickers, crearCargarVelas, crearValidarSimbolo } from './mercado.mjs';

const EXCHANGE = 'binance';
const WATCHLIST = 'principal';
const SONDEO_MS = 5000;

// quotes conocidas para separar base y quote cuando no vienen del exchange
const QUOTES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'BTC', 'ETH', 'BNB', 'EUR', 'TRY'];

// campos que acepta el alta de cada fila
const CAMPOS_OPERACION = ['exchange_id', 'symbol', 'lado', 'tipo', 'cantidad', 'precio_entrada', 'take_profit', 'stop_loss', 'estado', 'fees', 'notas', 'tags'];
const CAMPOS_ALERTA = ['exchange_id', 'symbol', 'tipo', 'campo', 'operador', 'valor', 'timeframe', 'activa', 'note'];

const elegir = (objeto, campos) => Object.fromEntries(campos.filter(campo => objeto[campo] !== undefined).map(campo => [campo, objeto[campo]]));

// path null usa data/app.db, ':memory:' una base temporal
export function abrirRegistro({ path, ahora = Date.now, fetch } = {}) {
  const datos = createData({ path, ahora });
  const { catalog, market, config, watchlist, alerts, operations } = datos;
  const registrados = new Set(catalog.listSymbols({ exchange: EXCHANGE }).map(simbolo => simbolo.symbol));
  let listaId = null;

  // suma el simbolo al catalogo con todos los intervalos, si falta
  function asegurarSimbolo(symbol, { base, quote } = {}) {
    if (registrados.has(symbol)) return;
    if (!base || !quote) {
      quote = QUOTES.find(candidata => symbol.endsWith(candidata) && symbol.length > candidata.length) ?? '?';
      base = quote === '?' ? symbol : symbol.slice(0, -quote.length);
    }
    catalog.registerSymbol({ exchange_id: EXCHANGE, symbol, base, quote });
    for (const interval of INTERVALS) catalog.enableInterval(EXCHANGE, symbol, interval);
    registrados.add(symbol);
  }

  // lo guardado, o lo que llega si la base es nueva - la primera vez arma la watchlist
  function cargarSesion({ simbolos, symbol, interval, saldo_inicial }) {
    const existente = watchlist.listWatchlists()[0];
    listaId = existente?.id ?? watchlist.createWatchlist(WATCHLIST).id;
    if (!existente) {
      for (const simbolo of simbolos) agregarSimbolo(simbolo);
    }
    const guardados = existente ? watchlist.listItems(listaId).map(item => item.symbol) : simbolos;
    const preferencias = config.readConfig();
    return {
      simbolos: guardados,
      symbol: preferencias?.simbolo_por_defecto ?? symbol,
      interval: preferencias?.intervalo_por_defecto ?? interval,
      saldo_inicial: preferencias?.saldo_inicial ?? saldo_inicial,
      operaciones: operations.listOperations(),
      alertas: alerts.listAlerts(),
    };
  }

  function guardarPreferencias({ symbol, interval, saldo_inicial }) {
    config.saveConfig({
      intervalo_por_defecto: interval,
      saldo_inicial,
      exchange_id: EXCHANGE,
      simbolo_por_defecto: symbol,
      fuente: 'local',
      sondeo_ms: config.readConfig()?.sondeo_ms ?? SONDEO_MS,
    });
  }

  // info trae base y quote del exchange cuando el simbolo viene del buscador
  function agregarSimbolo(symbol, info) {
    asegurarSimbolo(symbol, info);
    watchlist.addItem(listaId, { exchange_id: EXCHANGE, symbol });
  }

  function quitarSimbolo(symbol) {
    watchlist.removeItem(listaId, EXCHANGE, symbol);
  }

  function registrarOperacion(operacion) {
    asegurarSimbolo(operacion.symbol);
    return operations.registerOperation(elegir(operacion, CAMPOS_OPERACION));
  }

  // pasa a la base el cambio de estado o de notas que decidio el dominio - devuelve la fila guardada
  function guardarOperacion(anterior, nueva) {
    const { id } = anterior;
    if (anterior.estado === 'pendiente' && (nueva.estado === 'abierta' || nueva.estado === 'cerrada')) operations.activateOperation(id);
    if (nueva.estado === 'cerrada' && anterior.estado !== 'cerrada') {
      operations.closeOperation(id, { precio_salida: nueva.precio_salida, motivo_cierre: nueva.motivo_cierre });
    }
    if (nueva.estado === 'cancelada' && anterior.estado !== 'cancelada') operations.cancelOperation(id);
    if ((nueva.notas ?? null) !== (anterior.notas ?? null)) operations.editOperation(id, { notas: nueva.notas ?? null });
    return operations.getOperation(id);
  }

  function registrarAlerta(alerta) {
    asegurarSimbolo(alerta.symbol);
    return alerts.createAlert(elegir(alerta, CAMPOS_ALERTA));
  }

  // una alerta disparada queda marcada y apagada
  function guardarAlerta(anterior, nueva) {
    let fila = anterior;
    if (nueva.disparada && !anterior.disparada) fila = alerts.markTriggered(anterior.id);
    if (Boolean(nueva.activa) !== Boolean(fila.activa)) fila = alerts.updateAlert(anterior.id, { activa: nueva.activa ? 1 : 0 });
    return fila;
  }

  function borrarAlerta(id) {
    alerts.deleteAlert(id);
  }

  // velas y tickers quedan guardados al llegar, solo de simbolos del catalogo
  function guardarVelas(velas) {
    if (velas.length && registrados.has(velas[0].symbol)) market.saveCandles(velas);
  }

  function guardarTickers(tickers) {
    for (const ticker of tickers) if (registrados.has(ticker.symbol)) market.saveTicker(ticker);
  }

  // el conector sale de la url del exchange en el catalogo
  const binance = crearBinance({ baseUrl: catalog.getExchange(EXCHANGE).base_url + '/api/v3', fetch });
  const mercado = {
    cargarVelas: crearCargarVelas({ conectores: { binance: binance.klines }, guardar: guardarVelas }),
    cargarTickers: crearCargarTickers({ conectores: { binance: binance.tickers24h }, guardar: guardarTickers }),
    cargarSimbolos: crearCargarSimbolos({ conectores: { binance: binance.precios } }),
    validarSimbolo: crearValidarSimbolo({ conectores: { binance: binance.infoSimbolo } }),
  };

  return {
    mercado,
    cargarSesion,
    guardarPreferencias,
    agregarSimbolo,
    quitarSimbolo,
    registrarOperacion,
    guardarOperacion,
    registrarAlerta,
    guardarAlerta,
    borrarAlerta,
    cerrar: () => datos.close(),
  };
}
