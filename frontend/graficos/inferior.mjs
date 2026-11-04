// indicadores en carriles bajo el grafico

import { grid } from '../../backend/terminal/widgets.mjs';
import { anchoEje, anchoPlot, celdaLinea, columnaVela, dibujarEscalon, estiloVela, limitarVelas, putText } from './trazos.mjs';

function tieneValores(valores) {
  return Array.isArray(valores) && valores.some(valor => valor != null && Number.isFinite(Number(valor)));
}

// un indicador en su carril bajo el grafico, de 0 a tope o al maximo visible, con las columnas de graficoVelas
export function graficoInferior({
  velas = [],
  vacias = 0,
  width,
  height,
  showAxis = true,
  valores = [],
  tope = null,
  umbrales = [],
  style = { fg: 'accent' },
  colorDeVela = false,
} = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError('graficoInferior: faltan width y height');
  }

  const totalW = Math.max(1, Math.floor(width));
  const axisW = anchoEje(totalW, showAxis);
  const plotW = anchoPlot(totalW, showAxis);
  const totalH = Math.max(1, Math.floor(height));
  const cells = Array.from({ length: totalH }, () => Array(totalW).fill(null));
  const visibles = limitarVelas(velas, Math.max(1, plotW - vacias));
  if (!visibles.length) return grid({ width: totalW, height: totalH, cells });

  const serie = valores.slice(-visibles.length);
  const numeros = serie.filter(valor => valor != null && Number.isFinite(Number(valor))).map(Number);
  const maximo = tope ?? Math.max(0, ...numeros);
  const fila = valor => maximo > 0
    ? ((maximo - Math.max(0, Math.min(maximo, valor))) / maximo) * (totalH - 1)
    : totalH - 1;
  const colForIndex = (i) => columnaVela(i, visibles.length + vacias, plotW);

  const carril = Array.from({ length: totalH }, () => Array(plotW).fill(null));
  if (totalH >= 3) {
    for (const nivel of umbrales) {
      const row = Math.round(fila(nivel));
      for (let col = 0; col < plotW; col++) celdaLinea(carril, row, col, '·', { fg: 'muted' });
    }
  }
  const estilo = colorDeVela ? i => estiloVela(visibles[i]) : () => style;
  if (tieneValores(serie)) dibujarEscalon(carril, serie, colForIndex, fila, estilo);

  for (let row = 0; row < totalH; row++) {
    for (let col = 0; col < plotW; col++) {
      if (carril[row][col]) cells[row][axisW + col] = carril[row][col];
    }
  }
  if (showAxis) {
    putText(cells, 0, 0, '100', { fg: 'reader' });
    if (totalH > 1) putText(cells, totalH - 1, 0, '0', { fg: 'reader' });
  }

  return grid({ width: totalW, height: totalH, cells });
}
