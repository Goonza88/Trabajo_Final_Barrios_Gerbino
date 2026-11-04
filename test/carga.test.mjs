// tests de la pantalla de carga - logo en cuadrantes, titulo y monitor mientras carga

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flatten } from '../backend/terminal/view.mjs';
import { sanitize } from '../backend/terminal/ansi.mjs';
import { graficoLogo, graficoTitulo } from '../frontend/graficos/logo.mjs';
import { vistaCarga } from '../frontend/vistas/carga.mjs';
import { crearMonitor } from '../frontend/vistas/monitor.mjs';

const CUADRANTES = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';

test('el logo ocupa el doble de columnas que filas y es simetrico de lado a lado', () => {
  const logo = graficoLogo({ alto: 12 });
  assert.equal(logo.width, 24);
  assert.equal(logo.height, 12);
  // espejo horizontal de un cuadrante: izquierda y derecha se intercambian
  const espejo = ch => {
    const bits = CUADRANTES.indexOf(ch);
    return CUADRANTES[((bits & 1) << 1) | ((bits & 2) >> 1) | ((bits & 4) << 1) | ((bits & 8) >> 1)];
  };
  for (const fila of logo.cells) {
    const texto = fila.map(celda => celda?.ch ?? ' ');
    assert.deepEqual(texto, [...texto].reverse().map(espejo));
  }
  assert.ok(logo.cells.flat().filter(Boolean).every(celda => celda.style.fg === 'accent'));
});

test('el logo oscuro pinta sobre fondo accent hasta en las celdas vacias', () => {
  const logo = graficoLogo({ alto: 6, oscuro: true });
  const celdas = logo.cells.flat();
  assert.ok(celdas.every(celda => celda?.style.bg === 'accent'));
  assert.ok(celdas.some(celda => celda.ch !== ' ' && celda.style.fg === 'selected'));
});

test('el titulo queda cerca del ancho del logo con letras sin deformar', () => {
  for (const alto of [8, 12, 16, 24]) {
    const logo = graficoLogo({ alto });
    const titulo = graficoTitulo({ ancho: logo.width });
    // escala entera: cada columna de letra son las mismas columnas, a lo sumo medio paso del ancho del logo
    assert.ok(Math.abs(titulo.width - logo.width) <= 7, 'logo de ' + alto + ' filas: ' + titulo.width + ' contra ' + logo.width);
  }
  assert.deepEqual([graficoTitulo({ ancho: 16 }).width, graficoTitulo({ ancho: 16 }).height], [14, 3]);
  assert.deepEqual([graficoTitulo({ ancho: 48 }).width, graficoTitulo({ ancho: 48 }).height], [54, 5], 'el alto crece con la escala');
});

test('la carga centra el logo a un tercio del alto y deja el titulo solo si entra', () => {
  const ancha = flatten(vistaCarga({ cols: 120, rows: 36 }), 120, 36).map(linea => sanitize(linea.content));
  assert.equal(ancha.length, 36);
  const filasLogo = ancha.filter(linea => /[▘▝▀▖▌▞▛▗▚▐▜▄▙▟█]/.test(linea));
  assert.ok(filasLogo.length >= 12 + 3, 'logo de un tercio y el titulo');
  assert.ok(ancha.some(linea => linea.includes('cargando')));
  const primera = ancha.findIndex(linea => /[▘▝▀▖▌▞▛▗▚▐▜▄▙▟█]/.test(linea));
  const ultima = ancha.findIndex(linea => linea.includes('cargando'));
  assert.ok(Math.abs(primera - (35 - ultima)) <= 1, 'centrado en alto');

  const angosta = flatten(vistaCarga({ cols: 30, rows: 24 }), 30, 24).map(linea => sanitize(linea.content));
  const logoChico = angosta.filter(linea => /[▘▝▀▖▌▞▛▗▚▐▜▄▙▟█]/.test(linea));
  assert.equal(logoChico.length, 8 + 3, 'en chico el titulo tambien entra debajo');

});

test('el monitor muestra la carga hasta que llegan las primeras velas y tickers', async () => {
  let soltar;
  const espera = new Promise(resolve => { soltar = resolve; });
  const app = crearMonitor({ salir: () => {}, cargarVelas: async () => { await espera; return []; }, cargarTickers: async () => [] });
  const estado = await app.init();
  assert.equal(estado.cargando, true);
  assert.ok(flatten(app.view(estado), 80, 24).some(linea => sanitize(linea.content).includes('cargando')));

  soltar();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(estado.cargando, false);
  assert.ok(flatten(app.view(estado), 80, 24).some(linea => sanitize(linea.content).includes('watchlist')));
});
