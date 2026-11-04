// tabla de indicadores con su leyenda, series visibles y cajas inferiores

import { box, cols, rows, text } from '../../backend/terminal/widgets.mjs';
import { textWidth } from '../../backend/terminal/ansi.mjs';
import { boxSize } from '../../backend/terminal/layout.mjs';
import { graficoInferior } from '../graficos/inferior.mjs';

// cada indicador con su tecla, su nombre y su etiqueta con los parametros de la serie
export const INDICADORES = [
  { tecla: '1', nombre: 'sma', titulo: 'Media Simple', etiqueta: serie => 'SMA' + serie.periodo },
  { tecla: '2', nombre: 'ema', titulo: 'Media Exponencial', etiqueta: serie => 'EMA' + serie.periodo },
  { tecla: '3', nombre: 'rsi', titulo: 'RSI', etiqueta: serie => 'RSI' + serie.periodo,
    inferior: { titulo: 'RSI 0-100', tope: 100, umbrales: [30, 70], style: { fg: 'success' } } },
  { tecla: '4', nombre: 'volume', titulo: 'Volumen', etiqueta: () => 'VOL',
    inferior: { titulo: 'VOL % max', colorDeVela: true } },
  { tecla: '5', nombre: 'bollinger', titulo: 'Bandas de Bollinger', etiqueta: serie => 'BB' + serie.periodo + 'x' + serie.desviaciones },
];

// un texto por indicador, tenue apagado y resaltado encendido
export function leyendaIndicadores(estado) {
  const activos = estado.indicadores;
  return INDICADORES.map(({ tecla, nombre, etiqueta }) => text(
    tecla + ':' + etiqueta(estado.series[nombre]),
    { fg: activos[nombre] ? 'sec' : 'muted' }
  ));
}

// fila de cabecera - titulo a la izquierda y a la derecha las partes que entran sin cortarlo
export function cabecera(titulo, partes, ancho) {
  let libre = ancho - textWidth(titulo.content);
  const entran = [];
  for (const parte of partes) {
    libre -= textWidth(parte.content) + 1;
    if (libre < 0) break;
    entran.push(parte);
  }
  const derecha = entran.reduce((total, parte) => total + textWidth(parte.content) + 1, 0);
  return cols([titulo, ...entran], { widths: [Math.max(0, ancho - derecha)], gap: 1 });
}

// series de los indicadores activos, recortadas a ventana
export function indicadoresVisibles(estado, inicio, fin) {
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
export function inferioresVisibles(estado, inicio, fin) {
  return INDICADORES
    .filter(({ nombre, inferior }) => inferior && estado.indicadores[nombre])
    .map(({ nombre, inferior }) => ({ ...inferior, valores: estado.series[nombre].valores.slice(inicio, fin) }));
}

// alto de cajas inferiores y cuantas entran dejando al menos 10 filas
export function medidasInferiores(cantidad, height) {
  const alto = Math.min(6, Math.max(3, Math.floor(height * 0.15))) + 3;
  return { alto, entran: Math.max(0, Math.min(cantidad, Math.floor((height - 10) / alto))) };
}

// caja de indicador inferior - mismo ancho que el grafico
export function recuadroInferior(vis, inferior, width, height) {
  const marco = { border: 'round', pad: [0, 1], height, borderStyle: { fg: 'sec' } };
  const { innerW, innerH } = boxSize(marco, width);
  const { titulo, ...carril } = inferior;
  return box(rows([
    cabecera(text(''), [text(titulo, { fg: 'sec' })], innerW),
    graficoInferior({ velas: vis, width: innerW, height: Math.max(1, innerH - 1), ...carril }),
  ]), marco);
}
