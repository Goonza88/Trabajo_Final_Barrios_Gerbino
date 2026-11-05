// tests del grafico de velas - produce un grid exacto y sin ANSI

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten } from '../backend/terminal/view.mjs';
import { sanitize } from '../backend/terminal/ansi.mjs';
import { anchoPlot, limitarVelas } from '../frontend/graficos/trazos.mjs';
import { graficoVelas } from '../frontend/graficos/velas.mjs';
import { graficoInferior } from '../frontend/graficos/inferior.mjs';
import { tablaVelas } from '../frontend/graficos/tabla.mjs';

// mitades de arriba y abajo de cada trazo y lineas de cuerpo sin alto
const MITADES = {
  '╵': ['mecha', ''], '╷': ['', 'mecha'], '│': ['mecha', 'mecha'],
  '╹': ['cuerpo', ''], '╻': ['', 'cuerpo'], '┃': ['cuerpo', 'cuerpo'],
  '╽': ['mecha', 'cuerpo'], '╿': ['cuerpo', 'mecha'],
};
const RAYAS = { '┿': ['mecha', 'mecha'], '┷': ['mecha', ''], '┯': ['', 'mecha'], '━': ['', ''] };

// lee columna del grafico - bordes en filas y si mecha y cuerpo no dejan huecos
function leerVela(node, col) {
  const mitades = [];
  let raya = null;
  for (let row = 0; row < node.cells.length; row++) {
    const celda = node.cells[row][col];
    if (celda && RAYAS[celda.ch]) raya = row;
    mitades.push(...(celda && (RAYAS[celda.ch] ?? MITADES[celda.ch])) || ['', '']);
  }
  const cuerpo = mitades.flatMap((mitad, s) => mitad === 'cuerpo' ? [s] : []);
  const ocupadas = mitades.flatMap((mitad, s) => mitad ? [s] : []);
  const continua = ocupadas.every((s, i) => i === 0 || s === ocupadas[i - 1] + 1)
    && (raya == null || !ocupadas.length || (ocupadas[0] <= 2 * raya + 1 && ocupadas.at(-1) >= 2 * raya));
  if (raya != null) return { top: raya, bottom: raya, raya: true, continua };
  if (!cuerpo.length) return { top: NaN, bottom: NaN, raya: false, continua };
  return { top: cuerpo[0] / 2 - 0.5, bottom: (cuerpo.at(-1) + 1) / 2 - 0.5, raya: false, continua };
}

function velas(cantidad, base = 100) {
  return Array.from({ length: cantidad }, (_, i) => ({
    open_time: i * 60000,
    open: String(base + i),
    high: String(base + i + 2),
    low: String(base + i - 2),
    close: String(base + i + (i % 2 ? -1 : 1)),
    volume: '1',
  }));
}

test('graficoVelas devuelve un grid con el tamaño pedido', () => {
  const node = graficoVelas({
    velas: velas(12),
    width: 40,
    height: 11,
    interval: '1m',
    showAxis: true,
  });

  assert.equal(node.type, 'grid');
  assert.equal(node.width, 40);
  assert.equal(node.height, 11);
  assert.equal(node.cells.length, 11);
  assert.ok(node.cells.every(fila => fila.length === 40));

  const lineas = flatten(node, 40);
  assert.equal(lineas.length, 11);
  assert.ok(lineas.every(linea => linea.width <= 40));

  const celdas = node.cells.flat().filter(Boolean);
  assert.ok(celdas.every(celda => !celda.ch.includes('\x1b')));
  assert.ok(celdas.some(celda => celda.style?.fg === 'success' || celda.style?.fg === 'danger'));
  assert.equal(node._xlabels, undefined);
});

test('graficoVelas con rango plano no rompe', () => {
  const planas = velas(8).map(v => ({
    ...v,
    open: '100',
    high: '100',
    low: '100',
    close: '100',
  }));
  assert.doesNotThrow(() => flatten(graficoVelas({
    velas: planas,
    width: 30,
    height: 8,
  }), 30));
});

test('cierre de una vela y apertura de la siguiente comparten el mismo borde', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '110', high: '110', low: '99', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '101', low: '90', close: '90', volume: '1' },
    ],
    width: 2,
    height: 12,
    showAxis: false,
  });
  // velas rojas - el cierre es el borde de abajo y la apertura el de arriba
  assert.equal(leerVela(node, 0).bottom, leerVela(node, 1).top);
});

test('la mecha siempre toca el cuerpo', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '110', high: '113.3', low: '96.4', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '101.7', low: '88.2', close: '90', volume: '1' },
      { open_time: 120000, open: '90', high: '104.1', low: '89.6', close: '103.2', volume: '1' },
    ],
    width: 3,
    height: 12,
    showAxis: false,
  });
  for (let col = 0; col < 3; col++) assert.ok(leerVela(node, col).continua, 'hueco en la vela ' + col);
});

test('un borde de cuerpo en el limite de fila no deja hueco', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '121', high: '121', low: '105', close: '110', volume: '1' },
      { open_time: 60000, open: '110', high: '115', low: '100', close: '100', volume: '1' },
    ],
    width: 2,
    height: 12,
    showAxis: false,
  });
  const primera = leerVela(node, 0);
  const segunda = leerVela(node, 1);

  assert.equal(primera.bottom, segunda.top);
  assert.equal(primera.bottom % 1, 0.5, 'el borde cae justo entre dos filas');
});

test('un doji sigue siendo visible', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '100', high: '100', low: '100', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '100', low: '100', close: '100', volume: '1' },
    ],
    width: 2,
    height: 12,
    showAxis: false,
  });

  assert.ok(Number.isFinite(leerVela(node, 0).top));
  assert.ok(Number.isFinite(leerVela(node, 1).top));
});

test('un doji en el medio de una fila es una raya cruzada por la mecha', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '100', high: '110', low: '90', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '100', low: '90', close: '100', volume: '1' },
      { open_time: 120000, open: '100', high: '110', low: '100', close: '100', volume: '1' },
    ],
    width: 3,
    height: 3,
    showAxis: false,
  });

  assert.deepEqual([0, 1, 2].map(col => node.cells[1][col]?.ch), ['┿', '┯', '┷']);
  assert.ok([0, 1, 2].every(col => leerVela(node, col).continua));
});

test('dos velas verdes con un cuerpo corto empalman sus bordes', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '100', high: '100.5', low: '98.5', close: '100.5', volume: '1' },
      { open_time: 60000, open: '100.5', high: '111', low: '100.5', close: '101', volume: '1' },
    ],
    width: 2,
    height: 8,
    showAxis: false,
  });
  // en una vela verde el cierre es el borde de arriba y la apertura el de abajo
  assert.equal(leerVela(node, 0).top, leerVela(node, 1).bottom);
});

test('dos velas rojas con un cuerpo corto empalman sus bordes', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '101', high: '101', low: '98.5', close: '100.5', volume: '1' },
      { open_time: 60000, open: '100.5', high: '111', low: '100', close: '100', volume: '1' },
    ],
    width: 2,
    height: 8,
    showAxis: false,
  });
  assert.equal(leerVela(node, 0).bottom, leerVela(node, 1).top);
});

test('un doji empalma con la apertura de la vela siguiente', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '100', high: '100', low: '100', close: '100', volume: '1' },
      { open_time: 60000, open: '100', high: '100.5', low: '99', close: '100.5', volume: '1' },
    ],
    width: 2,
    height: 8,
    showAxis: false,
  });
  const doji = leerVela(node, 0);
  const apertura = leerVela(node, 1).bottom;
  assert.ok(doji.top === apertura || doji.bottom === apertura);
});

test('un cuerpo corto entre dos cuerpos largos empalma al menos un lado', () => {
  const node = graficoVelas({
    velas: [
      { open_time: 0, open: '101', high: '110', low: '100', close: '105', volume: '1' },
      { open_time: 60000, open: '105', high: '110', low: '100', close: '105.5', volume: '1' },
      { open_time: 120000, open: '105.5', high: '110', low: '100', close: '101', volume: '1' },
    ],
    width: 3,
    height: 8,
    showAxis: false,
  });
  const [primera, segunda, tercera] = [0, 1, 2].map(col => leerVela(node, col));

  const entrada = Math.abs(primera.top - segunda.bottom);
  const salida = Math.abs(segunda.top - tercera.top);
  assert.ok(Math.max(entrada, salida) <= 0.5);
  assert.equal(Math.min(entrada, salida), 0);
});

test('las lineas de indicadores no dejan huecos en sus esquinas', () => {
  const node = graficoInferior({ velas: velas(4), width: 4, height: 3, showAxis: false, valores: [0, 100, 0, 100], tope: 100 });
  // hacia donde sale cada trazo, y el trazo vecino tiene que entrar desde el lado opuesto
  const salidas = { '─': 'izq der', '│': 'arr aba', '╮': 'izq aba', '╯': 'izq arr', '╰': 'arr der', '╭': 'aba der' };
  const pasos = { izq: [0, -1, 'der'], der: [0, 1, 'izq'], arr: [-1, 0, 'aba'], aba: [1, 0, 'arr'] };
  const carril = node.cells;
  const trazos = carril.flatMap((fila, row) => fila.flatMap((celda, col) => salidas[celda?.ch] ? [{ row, col, ch: celda.ch }] : []));

  assert.ok(trazos.some(trazo => trazo.ch === '╭') && trazos.some(trazo => trazo.ch === '╯'));
  for (const { row, col, ch } of trazos) {
    for (const lado of salidas[ch].split(' ')) {
      const [dy, dx, opuesto] = pasos[lado];
      const vecino = carril[row + dy]?.[col + dx];
      if (col + dx < 0 || col + dx > 3) continue;
      assert.ok(vecino && salidas[vecino.ch]?.includes(opuesto), ch + ' en ' + row + ',' + col + ' no conecta hacia ' + lado);
    }
  }
});

test('un indicador inferior usa las mismas columnas que las velas', () => {
  const fuente = velas(6);
  const precio = graficoVelas({ velas: fuente, width: 20, height: 10 });
  const inferior = graficoInferior({ velas: fuente, width: 20, height: 4, valores: [50, 60, 40, 70, 30, 50], tope: 100, style: { fg: 'accent' } });
  const velasEnPrecio = [...new Set(precio.cells.flatMap(fila => fila.flatMap((celda, col) =>
    ['success', 'danger'].includes(celda?.style?.fg) ? [col] : [])))].sort((a, b) => a - b);

  assert.equal(inferior.height, 4);
  assert.deepEqual(velasEnPrecio, [9, 11, 13, 15, 17, 19]);
  assert.ok(velasEnPrecio.every(col => inferior.cells.some(fila => fila[col]?.style?.fg === 'accent')), 'cada vela tiene su punto abajo');
});

test('sin tope el indicador inferior se mide contra el maximo visible', () => {
  const inferior = graficoInferior({ velas: velas(3), width: 12, height: 3, valores: [5, 10, 0], style: { fg: 'success' } });
  const filaDe = col => inferior.cells.findIndex(fila => fila[col]?.style?.fg === 'success');
  assert.deepEqual([9, 10, 11].map(filaDe), [1, 0, 0], 'el maximo toca el techo');
  assert.equal(inferior.cells[2][11]?.style?.fg, 'success', 'el cero toca el piso');
});

test('con color de vela cada tramo del indicador inferior va del color de su vela', () => {
  // en velas() las pares cierran arriba (verdes) y las impares abajo (rojas)
  const inferior = graficoInferior({ velas: velas(4), width: 4, height: 3, showAxis: false, valores: [1, 2, 1, 2], colorDeVela: true });
  const colores = [0, 1, 2, 3].map(col => [...new Set(inferior.cells.flatMap(fila => fila[col] ? [fila[col].style.fg] : []))]);
  assert.deepEqual(colores, [['success'], ['danger'], ['success'], ['danger']]);
});

test('graficoVelas sin velas ocupa el grid y avisa', () => {
  const node = graficoVelas({ velas: [], width: 30, height: 8 });
  const lineas = flatten(node, 30);
  assert.equal(lineas.length, 8);
  assert.match(sanitize(lineas[0].content), /^sin velas/);
});

test('graficoVelas exige width y height', () => {
  assert.throws(() => graficoVelas({ velas: velas(2) }), /faltan width y height/);
});

test('el grafico muestra solo velas reales que entran en el area', () => {
  const fuente = velas(12);
  const capacidad = anchoPlot(13, true);
  const visibles = limitarVelas(fuente, capacidad);
  const node = graficoVelas({ velas: fuente, width: 13, height: 8 });

  assert.equal(capacidad, 4);
  assert.equal(visibles.length, capacidad);
  assert.deepEqual(visibles, fuente.slice(-capacidad));
  assert.equal(node.width, 13);
  assert.equal(node.height, 8);
});

test('la tabla pinta los valores de cada fila con el color de su vela', () => {
  const verde = { open_time: 0, open: '10', high: '12', low: '9', close: '11', volume: '5' };
  const roja = { open_time: 60000, open: '11', high: '12', low: '8', close: '10', volume: '6' };
  const [primera, segunda] = tablaVelas([verde, roja]).rows;
  assert.ok(primera.slice(1).every(celda => celda.style.fg === 'danger'), 'la mas reciente va arriba');
  assert.ok(segunda.slice(1).every(celda => celda.style.fg === 'success'));
});

test('la tabla muestra el volumen con al menos dos digitos enteros', () => {
  const vela = volume => ({ open_time: 0, open: '1', high: '1', low: '1', close: '1', volume });
  const volumenes = ['9.5', '0.25', '8', '12.5', '123'].map(v => tablaVelas([vela(v)]).rows[0][5].text);
  assert.deepEqual(volumenes, ['09.5', '00.25', '08', '12.5', '123']);
});
