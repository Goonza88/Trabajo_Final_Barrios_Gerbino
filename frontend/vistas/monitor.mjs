// reparte la pantalla entre watchlist y el grafico, mueve foco y escucha atajos
// una tabla de atajos escucha el teclado, arma la ayuda y la guia de indicadores

import { box, gap, rows, split, text } from '../../backend/terminal/widgets.mjs';
import { size, invalidate, Sub } from '../../backend/terminal/runtime.mjs';
import { sanitize } from '../../backend/terminal/ansi.mjs';
import { boxSize } from '../../backend/terminal/layout.mjs';
import { crearEstado } from '../estado/mercado.mjs';
import { anchoPlot } from '../graficos/trazos.mjs';
import { graficoVelas, leerMira, miraEnVela } from '../graficos/velas.mjs';
import { tablaVelas } from '../graficos/tabla.mjs';
import { anchoWatchlist, fmtPrecio, fmtVariacion, vistaWatchlist } from '../features/watchlist.mjs';
import { ANCHO_ORDEN, hayBorrador, vistaOrden } from '../features/orden.mjs';
import { vistaCarga } from './carga.mjs';
import { vistaDiario } from '../features/diario.mjs';
import { altoNotas, filasNotas, vistaNotas } from '../features/notas.mjs';
import { errorOrden } from '../estado/operaciones.mjs';
import { INDICADORES, cabecera, indicadoresVisibles, inferioresVisibles, leyendaIndicadores, medidasInferiores, recuadroInferior } from './indicadores.mjs';
import { alternarMira, decimalesVisibles, marcarEntrada, marcarNivel, moverMiraMouse, moverMiraTeclado } from './mira.mjs';

// ATAJOS ==========================================================================================

const TECLAS_INTERVALO = ['a', 's', 'd', 'f', 'g'];

// vuelve a pintar cuando termina una carga en segundo plano
function alTerminarCarga(promesa) {
  promesa.then(() => invalidate());
}

// la accion solo corre con el foco en el grafico
const enGrafico = accion => monitor => {
  if (monitor.estado.foco === 'grafico') accion(monitor);
};

// el grafico se ve si no lo reemplazan la tabla ni el diario
const conGrafico = estado => !estado.modoTabla && !estado.modoDiario;

// la accion solo corre con el diario abierto y el foco en el
const enDiario = accion => monitor => {
  if (monitor.estado.foco === 'grafico' && monitor.estado.modoDiario) accion(monitor);
};

// la accion solo corre con la mira sobre el grafico
const conMira = accion => monitor => {
  const { estado } = monitor;
  if (estado.foco === 'grafico' && estado.mira && conGrafico(estado)) accion(monitor, opcionesActuales(estado));
};

// en modo mira las flechas mueven la mira
const oMira = (dir, accion) => monitor => {
  const { estado } = monitor;
  if (estado.foco === 'grafico' && estado.modoMira && estado.mira) moverMiraTeclado(monitor, opcionesActuales(estado), dir);
  else accion(monitor);
};

// la caja de la orden cambia el ancho del grafico - la mira se queda en su vela
const conservandoMira = accion => monitor => {
  const { estado } = monitor;
  const previas = opcionesActuales(estado);
  const antes = estado.mira ? leerMira(previas) : null;
  accion(monitor);
  if (!antes || !estado.mira) return;
  // la vela por su hora, o el lugar vacio por su distancia a la ultima vela
  const opciones = opcionesActuales(estado);
  const indice = antes.vela
    ? opciones.velas.findIndex(vela => vela.open_time === antes.vela.open_time)
    : opciones.velas.length - 1 + antes.indice - (previas.velas.length - 1);
  if (indice >= 0) monitor.setMira(miraEnVela(opciones, indice, estado.mira.row));
};

// focos por los que pasa Tab - la caja de la orden solo mientras se ve
function focosDisponibles(estado) {
  return dimensiones(estado, size().cols).ordenW ? ['watchlist', 'grafico', 'orden'] : ['watchlist', 'grafico'];
}

// rango de teclas para la ayuda resumida de una seccion, como 'h-l'
const rango = teclas => teclas[0] + '-' + teclas.at(-1);

// atajos por seccion - cada uno con teclas, ayuda y accion, y la seccion con resumen
function atajos(intervalos = []) {
  const teclasIntervalo = TECLAS_INTERVALO.slice(0, intervalos.length);
  return [
    { atajos: [
      { teclas: ['Enter'], foco: 'watchlist', ayuda: 'Enter - Seleccionar', accion: monitor => {
        monitor.setFoco('grafico');
        alTerminarCarga(monitor.seleccionarCursor());
      } },
      { teclas: ['Tab'], ayuda: 'Tab - Cambiar Foco', accion: monitor => monitor.alternarFoco(focosDisponibles(monitor.estado)) },
      { teclas: ['Enter'], foco: 'orden', accion: conservandoMira(monitor => monitor.confirmarBorrador()) },
    ] },
    { resumen: 'h-l - Desplazar', atajos: [
      { teclas: ['h', 'ArrowLeft'], ayuda: 'h - Izquierda', accion: oMira('h', enGrafico(monitor => monitor.mover('h', cantidadVelasVisibles(monitor.estado)))) },
      { teclas: ['j', 'ArrowDown'], ayuda: 'j - Abajo', accion: oMira('j', monitor => {
        if (monitor.estado.foco === 'watchlist') monitor.moverCursor(1);
        else if (monitor.estado.foco === 'orden') monitor.cambiarPorcentaje('-');
        else if (monitor.estado.modoDiario) monitor.moverDiario(1);
        else monitor.mover('j');
      }) },
      { teclas: ['k', 'ArrowUp'], ayuda: 'k - Arriba', accion: oMira('k', monitor => {
        if (monitor.estado.foco === 'watchlist') monitor.moverCursor(-1);
        else if (monitor.estado.foco === 'orden') monitor.cambiarPorcentaje('+');
        else if (monitor.estado.modoDiario) monitor.moverDiario(-1);
        else monitor.mover('k');
      }) },
      { teclas: ['l', 'ArrowRight'], ayuda: 'l - Derecha', accion: oMira('l', enGrafico(monitor => monitor.mover('l', cantidadVelasVisibles(monitor.estado)))) },
    ] },
    { resumen: 'y-o - Zoom', atajos: [
      { teclas: ['y'], ayuda: 'y - Alejar Horizontal', accion: enGrafico(monitor => monitor.zoomH('-', capacidadZoom(monitor.estado))) },
      { teclas: ['u'], ayuda: 'u - Alejar Vertical', accion: enGrafico(monitor => monitor.zoomV('-')) },
      { teclas: ['i'], ayuda: 'i - Acercar Vertical', accion: enGrafico(monitor => monitor.zoomV('+')) },
      { teclas: ['o'], ayuda: 'o - Acercar Horizontal', accion: enGrafico(monitor => monitor.zoomH('+', capacidadZoom(monitor.estado))) },
    ] },
    { resumen: 'q-r - Operacion', atajos: [
      { teclas: ['q'], ayuda: 'q - Take Profit', accion: conservandoMira(conMira((monitor, opciones) => marcarNivel(monitor, opciones, 'take_profit'))) },
      { teclas: ['w'], ayuda: 'w - Entrada Limite', accion: conservandoMira(conMira(marcarEntrada)) },
      { teclas: ['e'], ayuda: 'e - Stop Loss', accion: conservandoMira(conMira((monitor, opciones) => marcarNivel(monitor, opciones, 'stop_loss'))) },
      { teclas: ['r'], ayuda: 'r - Entrada Mercado', accion: conservandoMira(enGrafico(monitor => {
        const ultimo = monitor.estado.velas.at(-1)?.close;
        if (ultimo != null) monitor.fijarEntrada('mercado', fmtPrecio(ultimo));
      })) },
    ] },
    { resumen: rango(teclasIntervalo) + ' - Intervalos', atajos: teclasIntervalo.map((tecla, i) => ({
      teclas: [tecla],
      ayuda: tecla + ' - Intervalo ' + intervalos[i],
      accion: monitor => alTerminarCarga(monitor.setIntervalo(intervalos[i])),
    })) },
    { atajos: [
      { teclas: ['z'], ayuda: 'z - Vista de Tabla', accion: monitor => monitor.alternarTabla() },
      { teclas: ['t'], ayuda: 't - Diario', accion: monitor => monitor.alternarDiario() },
      // acciones sobre la fila elegida del diario, las anuncia el propio diario
      { teclas: ['m'], foco: 'grafico', accion: enDiario(monitor => monitor.cerrarSeleccionada()) },
      { teclas: ['Backspace', 'Delete'], foco: 'grafico', accion: enDiario(monitor => monitor.cancelarSeleccionada()) },
      { teclas: ['Enter'], foco: 'grafico', accion: enDiario(monitor => monitor.empezarNotas(filasNotas(size().rows))) },
      { teclas: ['x'], ayuda: 'x - Iniciar Mira', accion: enGrafico(monitor => {
        if (conGrafico(monitor.estado)) alternarMira(monitor, opcionesActuales(monitor.estado));
      }) },
      { teclas: ['c'], ayuda: 'c - Descartar Accion', accion: conservandoMira(enGrafico(monitor => monitor.descartarBorrador())) },
    ] },
    { resumen: rango(INDICADORES.map(({ tecla }) => tecla)) + ' - Indicadores', atajos: INDICADORES.map(({ tecla, nombre, titulo }) => ({
      teclas: [tecla],
      ayuda: tecla + ' - ' + titulo,
      accion: monitor => monitor.alternarIndicador(nombre),
    })) },
    { atajos: [
      { teclas: ['Esc'], ayuda: 'Esc - Volver', accion: monitor => {
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
      lineas: atajos.map(atajo => atajo.ayuda).filter(Boolean),
      resumen: atajos.length > 1 ? resumen : undefined,
    }));
}

// MEDIDAS =========================================================================================

function fmtHora(ts) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleTimeString('es-AR'); } catch { return '-'; }
}

// anchos de watchlist, grafico y caja de la orden - la caja solo si hay orden y el grafico conserva 40 columnas
function dimensiones(estado, cols) {
  const watchW = Math.max(anchoWatchlist(seccionesAyuda(estado.intervalos)), Math.min(32, Math.floor(cols * 0.38)));
  const ordenW = hayBorrador(estado.borrador) && cols - watchW - ANCHO_ORDEN - 2 >= 40 ? ANCHO_ORDEN : 0;
  const chartW = Math.max(1, cols - watchW - 1 - (ordenW ? ordenW + 1 : 0));
  return { watchW, chartW, ordenW };
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

// ventana de velas visibles - offset negativo son lugares vacios a la derecha de la ultima
export function rangoVentanaVelas(total, cantidad, offset = 0) {
  const count = Math.max(1, Math.floor(cantidad));
  const maxOffset = Math.max(0, total - count);
  const safeOffset = Number.isFinite(offset)
    ? Math.max(-(count - 1), Math.min(maxOffset, Math.floor(offset)))
    : 0;
  const vacias = Math.max(0, -safeOffset);
  const fin = total - Math.max(0, safeOffset);
  return { inicio: Math.max(0, fin - (count - vacias)), fin, vacias };
}

// PANELES =========================================================================================

// medidas del panel de velas en pantalla
function medidasPanel(estado, cols, height) {
  const { watchW, chartW } = dimensiones(estado, cols);
  const { inicio, fin, vacias } = rangoVentanaVelas(estado.velas.length, cantidadVelasVisibles(estado, cols), estado.offset);
  const activos = conGrafico(estado) ? inferioresVisibles(estado, inicio, fin) : [];
  const { alto, entran } = medidasInferiores(activos.length, height);
  const marco = { border: 'round', pad: [0, 1], height: height - alto * entran };
  const { innerW, innerH } = boxSize(marco, chartW);
  // grilla comienza tras el separador, borde y padding, bajo el borde y cabecera
  const origen = { x: watchW + 3, y: 3 };
  return { chartW, inicio, fin, vacias, inferiores: activos.slice(0, entran), alto, marco, innerW, gridH: Math.max(2, innerH - 3), origen };
}

// lineas de entrada, tp y sl
const lineasOrden = ({ entrada, take_profit, stop_loss }) => [
  { precio: entrada, style: { fg: 'text' } },
  { precio: take_profit, style: { fg: 'success' } },
  { precio: stop_loss, style: { fg: 'danger' } },
];

// lineas del borrador y de las operaciones vivas del simbolo
function nivelesBorrador(estado) {
  const vivas = estado.operaciones.filter(operacion =>
    operacion.symbol === estado.symbol && (operacion.estado === 'abierta' || operacion.estado === 'pendiente'));
  return [
    ...vivas.flatMap(operacion => lineasOrden({ ...operacion, entrada: operacion.precio_entrada })),
    ...lineasOrden(estado.borrador),
  ];
}

// opciones del grafico de precios para la ventana, mismas para dibujarlo y leer la mira
function opcionesGrafico(estado, medidas) {
  return {
    velas: estado.velas.slice(medidas.inicio, medidas.fin),
    vacias: medidas.vacias,
    width: medidas.innerW,
    height: medidas.gridH,
    showAxis: true,
    interval: estado.interval,
    zoomY: estado.zoomY,
    offsetY: estado.offsetY,
    indicadores: indicadoresVisibles(estado, medidas.inicio, medidas.fin),
    mira: conGrafico(estado) ? estado.mira : null,
    niveles: nivelesBorrador(estado),
  };
}

// opciones del grafico con las medidas de la terminal actual
function opcionesActuales(estado) {
  const { cols, rows: height } = size();
  return opcionesGrafico(estado, medidasPanel(estado, cols, height));
}

// titulo del grafico - con mira muestra precio, variacion y hora de la vela
function tituloGrafico(estado, opciones) {
  const lectura = opciones.mira ? leerMira(opciones) : null;
  const inicio = estado.symbol + ' ' + estado.interval + ' | ';
  if (lectura) {
    const { vela, precio } = lectura;
    const texto = inicio + fmtPrecio(precio.toFixed(decimalesVisibles(opciones.velas)));
    if (!vela) return texto + ' | vela:- | -';
    const variacion = (Number(vela.close) - Number(vela.open)) / Number(vela.open) * 100;
    const hora = new Date(vela.open_time).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return texto + ' | vela:' + fmtVariacion(variacion) + ' | ' + hora;
  }
  const precio = estado.velas.at(-1)?.close ?? estado.tickers[estado.symbol]?.price;
  return inicio + fmtPrecio(precio) + ' | 24h:' + fmtVariacion(estado.variaciones[estado.symbol])
    + ' | ' + fmtHora(estado.actualizado_en);
}

// diario en el lugar del grafico con la caja de notas de la operacion elegida debajo
function panelDiario(estado, marco, width) {
  const alto = altoNotas(marco.height);
  const marcoDiario = { ...marco, height: marco.height - alto };
  const { innerW, innerH } = boxSize(marcoDiario, width);
  return rows([
    box(vistaDiario(estado, { width: innerW, height: innerH }), marcoDiario),
    vistaNotas(estado, { width, height: alto }),
  ]);
}

// panel de velas - grafico o tabla segun modo, con espacio para indicadores inferiores
function panelVelas(estado, medidas) {
  const { chartW, inferiores, alto, innerW } = medidas;
  const opciones = opcionesGrafico(estado, medidas);
  const vis = opciones.velas;
  const marco = { ...medidas.marco, borderStyle: estado.foco === 'grafico' ? { fg: 'accent' } : null };
  if (estado.modoDiario) return panelDiario(estado, marco, chartW);
  const error = estado.error ?? errorOrden(estado);
  const titulo = tituloGrafico(estado, opciones);
  const contenido = estado.modoTabla ? tablaVelas(vis) : graficoVelas(opciones);

  const grafico = box(rows([
    cabecera(text(titulo, { fg: 'accent' }), leyendaIndicadores(estado), innerW),
    gap(1),
    contenido,
    error ? text('err: ' + sanitize(error), { fg: 'danger' }) : null
  ].filter(Boolean)), marco);
  if (!inferiores.length) return grafico;
  return rows([grafico, ...inferiores.map(inferior => recuadroInferior(vis, { ...inferior, vacias: opciones.vacias }, chartW, alto))]);
}

export function vistaMonitor(estado) {
  const { cols, rows: height } = size();
  const { watchW, ordenW } = dimensiones(estado, cols);
  return split({
    dir: 'h',
    sizes: ordenW ? [watchW, null, ordenW] : [watchW, null],
    gap: 1,
    children: [
      vistaWatchlist(estado, { width: watchW, height, ayuda: seccionesAyuda(estado.intervalos) }),
      panelVelas(estado, medidasPanel(estado, cols, height)),
      ordenW ? vistaOrden(estado, { width: ordenW, height }) : null,
    ].filter(Boolean)
  });
}

// APP =============================================================================================

// arma el monitor como app del runtime
export function crearMonitor({ salir, sondeoMs = 5000, ...opciones }) {
  const monitor = { ...crearEstado(opciones), salir };
  const { estado } = monitor;

  return {
    // la pantalla de carga queda hasta que llegan las primeras velas y tickers
    init: () => {
      monitor.reiniciarVista();
      estado.cargando = true;
      Promise.all([monitor.cargar(), monitor.cargarTickers()]).then(() => {
        estado.cargando = false;
        invalidate();
      });
      return estado;
    },
    subscriptions: [Sub.interval(sondeoMs, 'poll')],
    update: (model, event) => {
      if (event.type === 'key') {
        // mientras se editan las notas del diario cada tecla escribe
        if (estado.diario.notas != null) {
          monitor.teclearNotas(event.key);
          return estado;
        }
        // una tecla puede tener un atajo por foco
        const foco = estado.foco;
        atajos(estado.intervalos).flatMap(seccion => seccion.atajos)
          .filter(atajo => atajo.teclas.includes(event.key) && (atajo.foco == null || [atajo.foco].flat().includes(foco)))
          .forEach(atajo => atajo.accion(monitor));
        // si la caja de la orden se cerro con el foco puesto, vuelve al grafico
        if (!focosDisponibles(estado).includes(estado.foco)) monitor.setFoco('grafico');
        return estado;
      }
      if (event.type === 'mouse') {
        const { cols, rows: height } = size();
        moverMiraMouse(monitor, event, medidasPanel(estado, cols, height));
        return estado;
      }
      if (event.type === 'sub:tick' && event.tag === 'poll') {
        alTerminarCarga(monitor.cargar({ reemplazar: false }));
        alTerminarCarga(monitor.cargarTickers({ reemplazar: false }));
        return estado;
      }
      return model;
    },
    view: () => estado.cargando ? vistaCarga(size()) : vistaMonitor(estado),
  };
}