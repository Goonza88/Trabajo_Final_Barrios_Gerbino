// reparte la pantalla entre watchlist y el grafico, mueve foco y escucha atajos
// una tabla de atajos escucha el teclado, arma la ayuda y la guia de indicadores

import { box, gap, rows, split, text } from '../../backend/terminal/widgets.mjs';
import { size, invalidate, Sub } from '../../backend/terminal/runtime.mjs';
import { sanitize } from '../../backend/terminal/ansi.mjs';
import { boxSize } from '../../backend/terminal/layout.mjs';
import { crearEstado } from '../estado/mercado.mjs';
import { anchoPlot, graficoInferior, graficoVelas, tablaVelas } from '../graficos/velas.mjs';
import { anchoWatchlist, fmtPrecio, fmtVariacion, vistaWatchlist } from '../features/watchlist.mjs';

// ATAJOS ==========================================================================================

const TECLAS_INTERVALO = ['a', 's', 'd', 'f', 'g'];

// cada indicador con su tecla, su nombre y su etiqueta con los parametros de la serie
const INDICADORES = [
  { tecla: '1', nombre: 'sma', titulo: 'Media Simple', etiqueta: serie => 'SMA' + serie.periodo },
  { tecla: '2', nombre: 'ema', titulo: 'Media Exponencial', etiqueta: serie => 'EMA' + serie.periodo },
  { tecla: '3', nombre: 'rsi', titulo: 'RSI', etiqueta: serie => 'RSI' + serie.periodo,
    inferior: { titulo: 'RSI 0-100', tope: 100, umbrales: [30, 70], style: { fg: 'success' } } },
  { tecla: '4', nombre: 'volume', titulo: 'Volumen', etiqueta: () => 'VOL',
    inferior: { titulo: 'VOL % max', colorDeVela: true } },
  { tecla: '5', nombre: 'bollinger', titulo: 'Bandas de Bollinger', etiqueta: serie => 'BB' + serie.periodo + 'x' + serie.desviaciones },
];

// vuelve a pintar cuando termina una carga en segundo plano
function alTerminarCarga(promesa) {
  promesa.then(() => invalidate());
}

// la accion solo corre con el foco en el grafico
const enGrafico = accion => monitor => {
  if (monitor.estado.foco === 'grafico') accion(monitor);
};

// rango de teclas para la ayuda resumida de una seccion, como 'h-l'
const rango = teclas => teclas[0] + '-' + teclas.at(-1);

// atajos por seccion - cada uno con teclas, ayuda y accion, y la seccion con resumen
function atajos(intervalos = []) {
  const teclasIntervalo = TECLAS_INTERVALO.slice(0, intervalos.length);
  return [
    { atajos: [
      { teclas: ['Enter'], ayuda: 'Enter - Seleccionar', accion: monitor => {
        if (monitor.estado.foco !== 'watchlist') return;
        monitor.setFoco('grafico');
        alTerminarCarga(monitor.seleccionarCursor());
      } },
      { teclas: ['Tab'], ayuda: 'Tab - Cambiar Foco', accion: monitor => monitor.alternarFoco() },
    ] },
    { resumen: 'h-l - Desplazar', atajos: [
      { teclas: ['h', 'ArrowLeft'], ayuda: 'h - Izquierda', accion: enGrafico(monitor => monitor.mover('h', cantidadVelasVisibles(monitor.estado))) },
      { teclas: ['j', 'ArrowDown'], ayuda: 'j - Abajo', accion: monitor => {
        if (monitor.estado.foco === 'watchlist') monitor.moverCursor(1);
        else monitor.mover('j');
      } },
      { teclas: ['k', 'ArrowUp'], ayuda: 'k - Arriba', accion: monitor => {
        if (monitor.estado.foco === 'watchlist') monitor.moverCursor(-1);
        else monitor.mover('k');
      } },
      { teclas: ['l', 'ArrowRight'], ayuda: 'l - Derecha', accion: enGrafico(monitor => monitor.mover('l', cantidadVelasVisibles(monitor.estado))) },
    ] },
    { resumen: 'y-o - Zoom', atajos: [
      { teclas: ['y'], ayuda: 'y - Alejar Horizontal', accion: enGrafico(monitor => monitor.zoomH('-', capacidadZoom(monitor.estado))) },
      { teclas: ['u'], ayuda: 'u - Alejar Vertical', accion: enGrafico(monitor => monitor.zoomV('-')) },
      { teclas: ['i'], ayuda: 'i - Acercar Vertical', accion: enGrafico(monitor => monitor.zoomV('+')) },
      { teclas: ['o'], ayuda: 'o - Acercar Horizontal', accion: enGrafico(monitor => monitor.zoomH('+', capacidadZoom(monitor.estado))) },
    ] },
    { atajos: [
      { teclas: ['t'], ayuda: 't - Vista de Tabla', accion: monitor => monitor.alternarTabla() },
    ] },
    { resumen: rango(teclasIntervalo) + ' - Intervalos', atajos: teclasIntervalo.map((tecla, i) => ({
      teclas: [tecla],
      ayuda: tecla + ' - Intervalo ' + intervalos[i],
      accion: monitor => alTerminarCarga(monitor.setIntervalo(intervalos[i])),
    })) },
    { resumen: rango(INDICADORES.map(({ tecla }) => tecla)) + ' - Indicadores', atajos: INDICADORES.map(({ tecla, nombre, titulo }) => ({
      teclas: [tecla],
      ayuda: tecla + ' - ' + titulo,
      accion: monitor => monitor.alternarIndicador(nombre),
    })) },
    { atajos: [
      { teclas: ['q'], ayuda: 'q - Volver', accion: monitor => {
        monitor.cancelar();
        monitor.salir();
      } },
    ] },
  ];
}

// la ayuda por seccion - sus lineas, y el resumen si tiene mas de una linea para plegar
export function seccionesAyuda(intervalos) {
  return atajos(intervalos)
    .filter(seccion => seccion.atajos.length)
    .map(({ resumen, atajos }) => ({
      lineas: atajos.map(atajo => atajo.ayuda),
      resumen: atajos.length > 1 ? resumen : undefined,
    }));
}

// MEDIDAS =========================================================================================

function fmtHora(ts) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleTimeString('es-AR'); } catch { return '-'; }
}

function dimensiones(estado, cols) {
  const watchW = Math.max(anchoWatchlist(seccionesAyuda(estado.intervalos)), Math.min(32, Math.floor(cols * 0.38)));
  const chartW = Math.max(1, cols - watchW - 1);
  return { watchW, chartW };
}

// cuantas velas entran en el grafico segun el ancho de la terminal
export function capacidadVelas(estado, cols = size().cols) {
  const { chartW } = dimensiones(estado, cols);
  const marco = { border: 'round', pad: [0, 1] };
  const { innerW } = boxSize(marco, chartW);
  return anchoPlot(innerW, true);
}

// la tabla no esta limitada por el ancho del grafico
function capacidadZoom(estado, cols) {
  return estado.modoTabla ? Infinity : capacidadVelas(estado, cols);
}

export function cantidadVelasVisibles(estado, cols = size().cols) {
  return Math.min(estado.zoomX, capacidadZoom(estado, cols));
}

export function rangoVentanaVelas(total, cantidad, offset = 0) {
  const count = Math.max(1, Math.floor(cantidad));
  const maxOffset = Math.max(0, total - count);
  const safeOffset = Number.isFinite(offset)
    ? Math.max(0, Math.min(maxOffset, Math.floor(offset)))
    : 0;
  const fin = total - safeOffset;
  return { inicio: Math.max(0, fin - count), fin };
}

// PANELES =========================================================================================

function leyendaIndicadores(estado) {
  const activos = estado.indicadores;
  return INDICADORES
    .map(({ tecla, nombre, etiqueta }) => tecla + ':' + etiqueta(estado.series[nombre]) + (activos[nombre] ? '+' : '-'))
    .join(' ');
}

// series de los indicadores activos, recortadas a la ventana visible
function indicadoresVisibles(estado, inicio, fin) {
  const { series, indicadores: activos } = estado;
  const recortar = valores => valores.slice(inicio, fin);
  return {
    sma: activos.sma ? recortar(series.sma.valores) : null,
    ema: activos.ema ? recortar(series.ema.valores) : null,
    bollinger: activos.bollinger ? {
      middle: recortar(series.bollinger.middle),
      upper: recortar(series.bollinger.upper),
      lower: recortar(series.bollinger.lower),
    } : null,
  };
}

// indicadores activos con recuadro propio bajo el grafico, con serie recortada a ventana
function inferioresVisibles(estado, inicio, fin) {
  return INDICADORES
    .filter(({ nombre, inferior }) => inferior && estado.indicadores[nombre])
    .map(({ nombre, inferior }) => ({ ...inferior, valores: estado.series[nombre].valores.slice(inicio, fin) }));
}

// alto de cajas inferiores y cuantas entran dejando al menos 10 filas
function medidasInferiores(cantidad, height) {
  const alto = Math.min(6, Math.max(3, Math.floor(height * 0.15))) + 3;
  return { alto, entran: Math.max(0, Math.min(cantidad, Math.floor((height - 10) / alto))) };
}

// caja de indicador inferior - mismo ancho que el grafico
function recuadroInferior(estado, vis, inferior, width, height) {
  const marco = {
    border: 'round',
    pad: [0, 1],
    height,
    borderStyle: estado.foco === 'grafico' ? { fg: 'accent' } : null
  };
  const { innerW, innerH } = boxSize(marco, width);
  const { titulo, ...carril } = inferior;
  return box(rows([
    text(titulo, { fg: 'muted' }),
    graficoInferior({ velas: vis, width: innerW, height: Math.max(1, innerH - 1), ...carril }),
  ]), marco);
}

// panel de velas - grafico o tabla segun modo, con espacio para indicadores inferiores
function panelVelas(estado, width, height, visibleCount) {
  const { inicio, fin } = rangoVentanaVelas(estado.velas.length, visibleCount, estado.offset);
  const vis = estado.velas.slice(inicio, fin);
  const indicadores = indicadoresVisibles(estado, inicio, fin);
  const activos = estado.modoTabla ? [] : inferioresVisibles(estado, inicio, fin);
  const { alto, entran } = medidasInferiores(activos.length, height);
  const inferiores = activos.slice(0, entran);
  const marco = {
    border: 'round',
    pad: [0, 1],
    height: height - alto * inferiores.length,
    borderStyle: estado.foco === 'grafico' ? { fg: 'accent' } : null
  };
  const { innerW, innerH } = boxSize(marco, width);
  const error = estado.error ? sanitize(estado.error) : null;
  const precio = estado.velas.at(-1)?.close ?? estado.tickers[estado.symbol]?.price;
  const cabecera = estado.symbol + ' ' + estado.interval + ' | ' + fmtPrecio(precio)
    + ' | 24h:' + fmtVariacion(estado.variaciones[estado.symbol])
    + ' | ' + fmtHora(estado.actualizado_en);

  const contenido = estado.modoTabla
    ? tablaVelas(vis)
    : graficoVelas({
      velas: vis,
      width: innerW,
      height: Math.max(2, innerH - 4),
      showAxis: true,
      interval: estado.interval,
      zoomY: estado.zoomY,
      offsetY: estado.offsetY,
      indicadores,
    });

  const grafico = box(rows([
    text(cabecera, { fg: 'accent' }),
    text(leyendaIndicadores(estado), { fg: 'muted' }),
    gap(1),
    contenido,
    error ? text('err: ' + error, { fg: 'danger' }) : null
  ].filter(Boolean)), marco);
  if (!inferiores.length) return grafico;
  return rows([grafico, ...inferiores.map(inferior => recuadroInferior(estado, vis, inferior, width, alto))]);
}

export function vistaMonitor(estado) {
  const { cols, rows: height } = size();
  const { watchW, chartW } = dimensiones(estado, cols);
  return split({
    dir: 'h',
    sizes: [watchW, null],
    gap: 1,
    children: [
      vistaWatchlist(estado, { width: watchW, height, ayuda: seccionesAyuda(estado.intervalos) }),
      panelVelas(estado, chartW, height, cantidadVelasVisibles(estado, cols))
    ]
  });
}

// APP =============================================================================================

// arma el monitor como app del runtime
export function crearMonitor({ salir, sondeoMs = 5000, ...opciones }) {
  const monitor = { ...crearEstado(opciones), salir };
  const { estado } = monitor;

  return {
    init: async () => {
      monitor.reiniciarVista();
      await Promise.all([monitor.cargar(), monitor.cargarTickers()]);
      return estado;
    },
    subscriptions: [Sub.interval(sondeoMs, 'poll')],
    update: (model, event) => {
      if (event.type === 'key') {
        const atajo = atajos(estado.intervalos).flatMap(seccion => seccion.atajos).find(a => a.teclas.includes(event.key));
        atajo?.accion(monitor);
        return estado;
      }
      if (event.type === 'sub:tick' && event.tag === 'poll') {
        alTerminarCarga(monitor.cargar({ reemplazar: false }));
        alTerminarCarga(monitor.cargarTickers({ reemplazar: false }));
        return estado;
      }
      return model;
    },
    view: () => vistaMonitor(estado),
  };
}