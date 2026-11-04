// logo y titulo de outplay en bloques de cuadrantes, a cualquier tamaño

import { grid } from '../../backend/terminal/widgets.mjs';

// contorno del svg del logo en caja de 800
const CONTORNOS = [
  [[153.847, 800], [0, 646.154], [123.076, 523.077], [0, 400], [123.076, 276.923], [0, 153.846], [153.847, 0],
    [276.924, 123.077], [400, 0], [523.076, 123.077], [646.153, 0], [800, 153.846], [676.924, 276.923], [800, 400],
    [676.924, 523.077], [800, 646.154], [646.153, 800], [523.076, 676.923], [400, 800], [276.924, 676.923]],
  [[276.924, 430.769], [215.385, 492.309], [123.076, 400], [215.384, 307.691], [276.924, 369.231], [369.229, 276.923],
    [307.692, 215.386], [400, 123.077], [492.308, 215.386], [430.771, 276.923], [523.076, 369.231], [584.615, 307.691],
    [676.924, 400], [584.616, 492.309], [523.076, 430.769], [430.771, 523.077], [492.308, 584.615], [400, 676.923],
    [307.692, 584.614], [369.229, 523.077]],
];

// letras de 3 por 5 para el titulo, una columna de separacion
const LETRAS = {
  o: ['###', '#.#', '#.#', '#.#', '###'],
  u: ['#.#', '#.#', '#.#', '#.#', '###'],
  t: ['###', '.#.', '.#.', '.#.', '.#.'],
  p: ['###', '#.#', '###', '#..', '#..'],
  l: ['#..', '#..', '#..', '#..', '###'],
  a: ['###', '#.#', '###', '#.#', '#.#'],
  y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
};

// cuadrantes por bits - arriba izquierda 1, arriba derecha 2, abajo izquierda 4, abajo derecha 8
const CUADRANTES = [' ', '▘', '▝', '▀', '▖', '▌', '▞', '▛', '▗', '▚', '▐', '▜', '▄', '▙', '▟', '█'];

// dentro del logo si semirrecta cruza contornos un numero impar de veces
function dentroDelLogo(x, y) {
  let dentro = false;
  for (const contorno of CONTORNOS) {
    for (let i = 0, j = contorno.length - 1; i < contorno.length; j = i++) {
      const [xi, yi] = contorno[i];
      const [xj, yj] = contorno[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
    }
  }
  return dentro;
}

// celdas de un bitmap 2x2 px - oscuro pinta sobre fondo accent
function celdas(anchoPx, altoPx, lleno, oscuro) {
  const style = oscuro ? { fg: 'selected', bg: 'accent' } : { fg: 'accent' };
  return Array.from({ length: Math.ceil(altoPx / 2) }, (_, fila) => Array.from({ length: Math.ceil(anchoPx / 2) }, (_, col) => {
    const x = col * 2, y = fila * 2;
    const bits = (lleno(x, y) ? 1 : 0) | (lleno(x + 1, y) ? 2 : 0) | (lleno(x, y + 1) ? 4 : 0) | (lleno(x + 1, y + 1) ? 8 : 0);
    if (bits) return { ch: CUADRANTES[bits], style };
    return oscuro ? { ch: ' ', style } : null;
  }));
}

// muestras por lado dentro de cada pixel - se pinta si al menos la mitad cae dentro del logo
const MUESTRAS = 4;

// pixeles del logo por alto, calculados una vez por tamaño
const mapas = new Map();

function mapaLogo(alto) {
  if (mapas.has(alto)) return mapas.get(alto);
  const altoPx = alto * 2;
  const anchoPx = alto * 4;
  const mapa = Array.from({ length: altoPx }, (_, y) => Array.from({ length: anchoPx }, (_, x) => {
    let dentro = 0;
    for (let i = 0; i < MUESTRAS; i++) {
      for (let j = 0; j < MUESTRAS; j++) {
        if (dentroDelLogo((x + (i + 0.5) / MUESTRAS) / anchoPx * 800, (y + (j + 0.5) / MUESTRAS) / altoPx * 800)) dentro++;
      }
    }
    return dentro * 2 >= MUESTRAS * MUESTRAS;
  }));
  mapas.set(alto, mapa);
  return mapa;
}

// logo de alto x filas - la celda es el doble de alta que ancha, ocupa el doble de columnas
export function graficoLogo({ alto, oscuro = false }) {
  const mapa = mapaLogo(alto);
  return grid({ width: alto * 2, height: alto, cells: celdas(alto * 4, alto * 2, (x, y) => mapa[y]?.[x], oscuro) });
}

// pixel de letra visible en la fila y columna del texto
function letraEn(texto, columna, fila) {
  const letra = LETRAS[texto[Math.floor(columna / 4)]] ?? LETRAS.o;
  return columna % 4 < 3 && letra[fila]?.[columna % 4] === '#';
}

// titulo cerca del ancho del logo sin warpear
export function graficoTitulo({ texto = 'outplay', ancho, oscuro = false }) {
  const columnas = texto.length * 4 - 1;
  // pixeles por px de letra - ancho el doble que de alto
  const horizontal = Math.max(1, Math.round(ancho * 2 / columnas));
  const vertical = Math.max(1, Math.round(horizontal / 2));
  const lleno = (x, y) => letraEn(texto, Math.floor(x / horizontal), Math.floor(y / vertical));
  const cells = celdas(columnas * horizontal, 5 * vertical, lleno, oscuro);
  return grid({ width: cells[0].length, height: cells.length, cells });
}
