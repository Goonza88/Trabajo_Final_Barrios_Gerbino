// mira del grafico sosteniendo click o con toggle y niveles marcados

import { anchoPlot } from '../graficos/trazos.mjs';
import { leerMira, miraEnVela } from '../graficos/velas.mjs';

// decimales de los precios visibles, sin contar ceros al final
export function decimalesVisibles(velas) {
  return Math.max(0, ...velas.flatMap(v => [v.open, v.high, v.low, v.close])
    .map(p => (String(p).split('.')[1] ?? '').replace(/0+$/, '').length));
}

// click izquierdo sostenido mueve la mira, al soltar se va sin teclado
export function moverMiraMouse(monitor, event, medidas) {
  const { estado } = monitor;
  if (event.phase === 'up') {
    if (!estado.modoMira) monitor.setMira(null);
    return;
  }
  if (event.btn !== 0 || estado.modoTabla || estado.modoDiario || (event.phase !== 'down' && event.phase !== 'drag')) return;
  const { innerW, gridH, origen } = medidas;
  const ejeW = innerW - anchoPlot(innerW, true);
  const col = event.col - 1 - origen.x;
  const row = event.row - 1 - origen.y;
  const dentro = col >= ejeW && col < innerW && row >= 0 && row < gridH - 1;
  if (event.phase === 'down' && !dentro) return;
  if (event.phase === 'drag' && !estado.mira) return;
  monitor.setMira({
    col: Math.max(ejeW, Math.min(innerW - 1, col)),
    row: Math.max(0, Math.min(gridH - 2, row)),
  });
}

// prende o apaga la mira - inicia sobre la ultima vela
export function alternarMira(monitor, opciones) {
  monitor.alternarModoMira();
  if (monitor.estado.modoMira) monitor.setMira(miraEnVela(opciones, opciones.velas.length - 1));
}

// h y l saltan de vela, j y k mueven una fila
export function moverMiraTeclado(monitor, opciones, dir) {
  const lectura = leerMira(opciones);
  if (!lectura) return;
  const { row } = opciones.mira;
  if (dir === 'h' || dir === 'l') {
    const destino = lectura.indice + (dir === 'l' ? 1 : -1);
    // en los bordes desplaza el grafico y la mira queda en su columna
    if (destino < 0 || destino >= lectura.lugares) monitor.mover(dir, lectura.lugares);
    else monitor.setMira(miraEnVela(opciones, destino, row));
  } else {
    monitor.setMira(miraEnVela(opciones, lectura.indice, row + (dir === 'j' ? 1 : -1)));
  }
}

// precio bajo la mira con los decimales visibles, null sin mira
function precioMira(opciones) {
  const lectura = leerMira(opciones);
  return lectura ? lectura.precio.toFixed(decimalesVisibles(opciones.velas)) : null;
}

// fija un nivel del borrador al precio bajo la mira
export function marcarNivel(monitor, opciones, campo) {
  const precio = precioMira(opciones);
  if (precio) monitor.fijarNivel(campo, precio);
}

// fija una entrada limit en el precio bajo la mira
export function marcarEntrada(monitor, opciones) {
  const precio = precioMira(opciones);
  if (precio) monitor.fijarEntrada('limite', precio);
}

// pone una alerta en el precio bajo la mira
export function marcarAlerta(monitor, opciones) {
  const precio = precioMira(opciones);
  if (precio) monitor.agregarAlerta(precio);
}
