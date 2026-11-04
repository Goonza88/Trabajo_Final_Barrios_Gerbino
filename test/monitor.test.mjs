// tests del monitor - la tabla de atajos atiende el teclado y arma la ayuda

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearMonitor, seccionesAyuda } from '../frontend/vistas/monitor.mjs';
import { flatten } from '../backend/terminal/view.mjs';
import { sanitize } from '../backend/terminal/ansi.mjs';

const tecla = key => ({ type: 'key', key });

function monitorDePrueba() {
  let salidas = 0;
  const app = crearMonitor({ simbolos: ['BTCUSDT', 'ETHUSDT'], salir: () => salidas++ });
  const estado = app.update(null, tecla('sin-atajo'));
  return { app, estado, salidas: () => salidas };
}

test('cada linea de ayuda sale de un atajo y los intervalos del estado', () => {
  const secciones = seccionesAyuda(['1m', '1h']);
  const ayuda = secciones.flatMap(seccion => seccion.lineas);
  assert.ok(ayuda.includes('a - Intervalo 1m'));
  assert.ok(ayuda.includes('s - Intervalo 1h'));
  assert.ok(!ayuda.some(linea => linea.startsWith('d - ')), 'sin intervalo la tecla no aparece');
  assert.ok(secciones.some(seccion => seccion.resumen === 'a-s - Intervalos'), 'el resumen sigue las teclas en uso');
  assert.equal(ayuda.at(-1), 'q - Volver');
});

test('t alterna la tabla', () => {
  const { app, estado } = monitorDePrueba();
  app.update(estado, tecla('t'));
  assert.equal(estado.modoTabla, true);
});

test('las teclas de indicador alternan su serie', () => {
  const { app, estado } = monitorDePrueba();
  const antes = estado.indicadores.sma;
  app.update(estado, tecla('1'));
  assert.equal(estado.indicadores.sma, !antes);
});

test('j mueve el cursor con foco en la watchlist y el grafico con foco en el grafico', () => {
  const { app, estado } = monitorDePrueba();
  app.update(estado, tecla('Tab'));
  assert.equal(estado.foco, 'watchlist');
  app.update(estado, tecla('j'));
  assert.equal(estado.cursor, 1);

  app.update(estado, tecla('Tab'));
  app.update(estado, tecla('ArrowDown'));
  assert.ok(estado.offsetY > 0);
});

test('el zoom no responde con foco en la watchlist', () => {
  const { app, estado } = monitorDePrueba();
  app.update(estado, tecla('Tab'));
  const zoomX = estado.zoomX;
  app.update(estado, tecla('o'));
  assert.equal(estado.zoomX, zoomX);
});

test('q cancela y sale', () => {
  const { app, estado, salidas } = monitorDePrueba();
  app.update(estado, tecla('q'));
  assert.equal(salidas(), 1);
});

test('con el click sostenido la mira cruza el grafico y la cabecera lee la vela elegida', () => {
  const { app, estado } = monitorDePrueba();
  estado.velas = Array.from({ length: 40 }, (_, i) => ({
    open_time: i * 60000, open: String(100 + i), high: String(103 + i), low: String(98 + i), close: String(101 + i), volume: '1',
  }));
  const mouse = (phase, col, row) => app.update(estado, { type: 'mouse', btn: 0, phase, col, row });
  const pantalla = () => flatten(app.view(estado), 80, 24).map(linea => sanitize(linea.content));

  assert.ok(pantalla().some(linea => linea.includes('·')), 'sin mira se ve la grilla');
  mouse('down', 5, 8);
  assert.equal(estado.mira, null, 'fuera del grafico no aparece');

  mouse('down', 60, 8);
  assert.ok(estado.mira);
  const conMira = pantalla();
  assert.ok(conMira.some(linea => linea.includes('┼')), 'cruce de las dos lineas');
  assert.ok(conMira.some(linea => linea.includes('╴')) && conMira.some(linea => linea.includes('╎')));
  assert.ok(!conMira.some(linea => linea.includes('·')), 'la grilla se oculta');
  assert.match(conMira[1], /\| vela:\+0\.\d+% \|/, 'la cabecera muestra la vela elegida');

  const antes = { ...estado.mira };
  mouse('drag', 70, 10);
  assert.notDeepEqual(estado.mira, antes, 'la mira sigue al mouse');
  mouse('up', 70, 10);
  assert.equal(estado.mira, null);
  assert.match(pantalla()[1], /\| 24h:/, 'al soltar vuelve la cabecera normal');
});
