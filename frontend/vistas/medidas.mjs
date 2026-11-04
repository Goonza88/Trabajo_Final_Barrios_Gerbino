// medidas de la interfaz - anchos de los paneles, ventana de velas y cajas del panel de velas

import { boxSize } from '../../backend/terminal/layout.mjs';
import { anchoPlot } from '../graficos/trazos.mjs';
import { anchoWatchlist } from '../features/watchlist.mjs';
import { ANCHO_ORDEN, hayBorrador } from '../features/orden.mjs';
import { ALTO_AVISO } from '../features/avisos.mjs';
import { inferioresVisibles, medidasInferiores } from './indicadores.mjs';

// el grafico se ve si no fue reemplazado por otro panel central
export const conGrafico = estado => !estado.modoTabla && !estado.modoDiario;

// anchos de watchlist, grafico y orden pendiente - grafico conserva 40 columnas
export function dimensiones(estado, cols, ayuda) {
  const watchW = Math.max(anchoWatchlist(ayuda), Math.min(32, Math.floor(cols * 0.38)));
  const ordenW = hayBorrador(estado.borrador) && cols - watchW - ANCHO_ORDEN - 2 >= 40 ? ANCHO_ORDEN : 0;
  const chartW = Math.max(1, cols - watchW - 1 - (ordenW ? ordenW + 1 : 0));
  return { watchW, chartW, ordenW };
}

// velas que entran en el grafico segun el ancho de terminal
export function capacidadVelas({ chartW }) {
  const marco = { border: 'round', pad: [0, 1] };
  const { innerW } = boxSize(marco, chartW);
  return anchoPlot(innerW, true);
}

// la tabla no esta limitada por el ancho del grafico
export function capacidadZoom(estado, anchos) {
  return estado.modoTabla ? Infinity : capacidadVelas(anchos);
}

export function cantidadVelasVisibles(estado, anchos) {
  return Math.min(estado.zoomX, capacidadZoom(estado, anchos));
}

// ventana de velas visibles - offset negativo para lugares vacios a la derecha
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

// medidas del panel de velas en pantalla
export function medidasPanel(estado, anchos, height) {
  const { watchW, chartW } = anchos;
  const { inicio, fin, vacias } = rangoVentanaVelas(estado.velas.length, cantidadVelasVisibles(estado, anchos), estado.offset);
  const activos = conGrafico(estado) ? inferioresVisibles(estado, inicio, fin) : [];
  const aviso = estado.avisos.length ? ALTO_AVISO : 0; // avisos quita alto al panel
  const { alto, entran } = medidasInferiores(activos.length, height - aviso);
  const marco = { border: 'round', pad: [0, 1], height: height - aviso - alto * entran };
  const { innerW, innerH } = boxSize(marco, chartW);
  const origen = { x: watchW + 3, y: aviso + 3 }; // despues de panel, separadores, bordes y titulos
  return { chartW, inicio, fin, vacias, inferiores: activos.slice(0, entran), alto, marco, innerW, gridH: Math.max(2, innerH - 3), origen };
}