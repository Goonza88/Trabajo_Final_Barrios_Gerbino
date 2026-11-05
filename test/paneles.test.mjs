// tests de los paneles del monitor - diario, alertas y buscador de simbolos

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearMonitor } from '../frontend/vistas/monitor.mjs';
import { flatten } from '../backend/terminal/view.mjs';
import { sanitize } from '../backend/terminal/ansi.mjs';

const tecla = key => ({ type: 'key', key });

function monitorDePrueba() {
  let salidas = 0;
  const app = crearMonitor({ simbolos: ['BTCUSDT', 'ETHUSDT'], salir: () => salidas++ });
  const estado = app.update(null, tecla('sin-atajo'));
  return { app, estado, salidas: () => salidas };
}

test('t abre el diario en lugar del grafico con metricas, filas vivas primero y acciones sobre la elegida', () => {
  const { app, estado, salidas } = monitorDePrueba();
  estado.velas = Array.from({ length: 40 }, (_, i) => ({
    open_time: i * 60000, open: String(100 + i), high: String(103 + i), low: String(98 + i), close: String(101 + i), volume: '1',
  }));
  const pantalla = () => flatten(app.view(estado), 120, 24).map(linea => sanitize(linea.content));
  // una cerrada en tp, una abierta y una pendiente
  const orden = (tipo, entrada, tp) => {
    app.update(estado, tecla('c'));
    estado.borrador = { tipo, entrada, take_profit: tp, stop_loss: null };
    estado.foco = 'orden';
    app.update(estado, tecla('Enter'));
  };
  orden('mercado', '140', '150');
  estado.operaciones = estado.operaciones.map(op => ({ ...op, estado: 'cerrada', precio_salida: '150', motivo_cierre: 'tp', cerrada_en: 1 }));
  orden('mercado', '140', '160');
  orden('limite', '120', '130');
  assert.equal(estado.operaciones.length, 3);

  app.update(estado, tecla('t'));
  assert.equal(estado.modoDiario, true);
  let lineas = pantalla();
  assert.ok(lineas.some(linea => linea.includes('diario')));
  assert.ok(lineas.some(linea => /cerradas 1 \| pnl \+\d/.test(linea)), 'metricas de las cerradas');
  const filas = lineas.map(linea => linea.match(/│ (\d+) .*\b(long|short)\b/)?.[1]).filter(Boolean);
  assert.deepEqual(filas, ['3', '2', '1'], 'vivas primero, de la mas nueva a la mas vieja');

  app.update(estado, tecla('Backspace'));
  assert.equal(estado.operaciones.find(op => op.id === 3).estado, 'cancelada', 'Backspace cancela la elegida');
  // la cancelada baja con las cerradas y la elegida pasa a ser la siguiente viva
  app.update(estado, tecla('m'));
  const cerrada = estado.operaciones.find(op => op.id === 2);
  assert.deepEqual([cerrada.estado, cerrada.motivo_cierre, cerrada.precio_salida], ['cerrada', 'manual', '140'], 'm cierra al ultimo precio');

  // ya no quedan vivas - arriba esta la cancelada y debajo la recien cerrada
  app.update(estado, tecla('j'));
  app.update(estado, tecla('Enter'));
  for (const letra of 'hola q') app.update(estado, tecla(letra));
  assert.ok(pantalla().some(linea => linea.includes('hola q')), 'mientras se edita las teclas escriben');
  assert.equal(estado.borrador.take_profit, null, 'q escribe en vez de marcar');
  app.update(estado, tecla('Enter'));
  for (const letra of '- **dos**') app.update(estado, tecla(letra));
  app.update(estado, tecla('Esc'));
  assert.equal(salidas(), 0, 'Esc guarda sin salir del monitor');
  assert.equal(estado.diario.notas, null);
  assert.equal(estado.operaciones.find(op => op.id === 2).notas, 'hola q\n- **dos**', 'una linea por renglon, sin las vacias del final');
  const notas = pantalla();
  assert.ok(notas.some(linea => linea.includes('notas #2')), 'la caja muestra las notas de la elegida');
  assert.ok(notas.some(linea => linea.includes('• dos')), 'con markdown simple');

  app.update(estado, tecla('Enter'));
  // la caja de 24 filas tiene 4 para lineas - las dos escritas y dos vacias
  assert.deepEqual(estado.diario.notas.lineas, ['hola q', '- **dos**', '', ''], 'las escritas y vacias hasta llenar la caja');
  app.update(estado, tecla('ArrowDown'));
  app.update(estado, tecla('ArrowDown'));
  for (const letra of 'tres') app.update(estado, tecla(letra));
  for (let i = 0; i < 2; i++) app.update(estado, tecla('Enter'));
  assert.equal(estado.diario.notas, null, 'Enter en la ultima linea guarda');
  assert.equal(estado.operaciones.find(op => op.id === 2).notas, 'hola q\n- **dos**\ntres');

  app.update(estado, tecla('z'));
  assert.equal(estado.modoDiario, false, 'la tabla cierra el diario');
  assert.equal(estado.modoTabla, true);
});

test('v pone una alerta en la mira, al cruzarla aparece el aviso arriba y se descarta con foco y Enter', async () => {
  let reloj = 1000;
  const base = Array.from({ length: 40 }, (_, i) => ({
    open_time: i * 60000, open: String(100 + i), high: String(103 + i), low: String(98 + i), close: String(101 + i), volume: '1',
  }));
  let velas = base;
  const app = crearMonitor({ simbolos: ['BTCUSDT', 'ETHUSDT'], salir: () => {}, ahora: () => reloj, cargarVelas: async () => velas, cargarTickers: async () => [] });
  const estado = app.update(null, tecla('sin-atajo'));
  estado.velas = base;
  const pantalla = () => flatten(app.view(estado), 120, 30).map(linea => sanitize(linea.content));

  app.update(estado, tecla('x'));
  for (let i = 0; i < 3; i++) app.update(estado, tecla('k'));
  app.update(estado, tecla('v'));
  assert.equal(estado.alertas.length, 1);
  const [alerta] = estado.alertas;
  assert.equal(alerta.operador, 'cruza_arriba', 'arriba del ultimo precio');
  assert.ok(pantalla().some(linea => new RegExp('│ ' + alerta.valor + ' +┄').test(linea)), 'la alerta deja su linea con el precio en el eje');
  app.update(estado, tecla('x'));

  reloj = 50 * 60000;
  velas = [...base, { open_time: 45 * 60000, open: '140', high: '200', low: '139', close: '150', volume: '1' }];
  await app.update(estado, { type: 'sub:tick', tag: 'poll' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(estado.alertas[0].activa, 0, 'se dispara y queda apagada');
  assert.equal(estado.avisos.length, 1);
  assert.ok(pantalla().some(linea => linea.includes('alerta BTCUSDT cruzo arriba de ' + alerta.valor)), 'el aviso aparece arriba');

  app.update(estado, tecla('Tab'));
  app.update(estado, tecla('Tab'));
  assert.equal(estado.foco, 'aviso', 'Tab pasa por el aviso');
  app.update(estado, tecla('Enter'));
  assert.equal(estado.avisos.length, 0);
  assert.equal(estado.foco, 'grafico', 'sin avisos el foco vuelve al grafico');
  assert.ok(!pantalla().some(linea => linea.includes('cruzo arriba')));

  app.update(estado, tecla('t'));
  assert.ok(pantalla().some(linea => linea.includes('alertas')), 'el diario tiene su seccion de alertas');
  assert.ok(pantalla().some(linea => linea.includes('disparada')));
  app.update(estado, tecla('Backspace'));
  assert.equal(estado.alertas.length, 0, 'Backspace borra la alerta elegida');
});

test('Enter en agregar abre el buscador a la derecha, se escribe y Enter suma el simbolo; Backspace lo quita', async () => {
  const app = crearMonitor({
    simbolos: ['BTCUSDT'],
    salir: () => {},
    cargarVelas: async () => [],
    cargarTickers: async () => [],
    cargarSimbolos: async () => ['SOLUSDT', 'SOLBTC', 'QNTUSDT'].map(symbol => ({ symbol, price: '1.5' })),
    validarSimbolo: async ({ symbol }) => ({ symbol }),
  });
  const estado = app.update(null, tecla('sin-atajo'));
  const pantalla = () => flatten(app.view(estado), 120, 30).map(linea => sanitize(linea.content));

  app.update(estado, tecla('Tab'));
  app.update(estado, tecla('j'));
  assert.ok(pantalla().some(linea => linea.includes('+ agregar')));
  app.update(estado, tecla('Enter'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(estado.buscador);
  assert.ok(pantalla().some(linea => linea.includes('agregar simbolo')), 'el buscador abre a la derecha');

  for (const letra of 'q') app.update(estado, tecla(letra));
  assert.equal(estado.borrador.take_profit, null, 'mientras se busca las teclas escriben');
  assert.ok(pantalla().some(linea => /QNTUSDT\s+1\.5/.test(linea)), 'lista los que coinciden con su precio');
  app.update(estado, tecla('Backspace'));
  for (const letra of 'sol') app.update(estado, tecla(letra));
  app.update(estado, tecla('Enter'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(estado.buscador, null);
  assert.deepEqual(estado.simbolos, ['BTCUSDT', 'SOLUSDT']);
  assert.ok(pantalla().some(linea => linea.includes('SOLUSDT')), 'el nuevo aparece en la watchlist');

  app.update(estado, tecla('Backspace'));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(estado.simbolos, ['BTCUSDT'], 'Backspace en la watchlist quita el elegido');
});
