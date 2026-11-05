// tests del monitor - la tabla de atajos atiende el teclado y arma la ayuda

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearMonitor, seccionesAyuda } from '../frontend/vistas/monitor.mjs';
import { crearEstado } from '../frontend/estado/mercado.mjs';
import { flatten } from '../backend/terminal/view.mjs';
import { sanitize, toAnsi } from '../backend/terminal/ansi.mjs';

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
  assert.equal(ayuda.at(-1), 'Esc - Volver');
});

test('z alterna la tabla', () => {
  const { app, estado } = monitorDePrueba();
  app.update(estado, tecla('z'));
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

test('Esc cancela y sale', () => {
  const { app, estado, salidas } = monitorDePrueba();
  app.update(estado, tecla('Esc'));
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

function monitorConVelas() {
  const prueba = monitorDePrueba();
  prueba.estado.velas = Array.from({ length: 40 }, (_, i) => ({
    open_time: i * 60000, open: String(100 + i), high: String(103 + i), low: String(98 + i), close: String(101 + i), volume: '1',
  }));
  return prueba;
}

test('x prende la mira sobre la ultima vela y en modo mira hjkl la mueven', () => {
  const { app, estado } = monitorConVelas();
  app.update(estado, tecla('x'));
  assert.equal(estado.modoMira, true);
  const inicial = { ...estado.mira };
  assert.ok(inicial.col > 0);

  app.update(estado, tecla('h'));
  assert.ok(estado.mira.col < inicial.col, 'h salta a la vela anterior');
  assert.equal(estado.offset, 0, 'y no desplaza el grafico');
  app.update(estado, tecla('j'));
  assert.equal(estado.mira.row, inicial.row + 1);
  app.update(estado, tecla('l'));
  assert.equal(estado.mira.col, inicial.col);

  app.update(estado, { type: 'mouse', btn: 0, phase: 'up', col: 1, row: 1 });
  assert.ok(estado.mira, 'en modo mira soltar el click no la borra');
  app.update(estado, tecla('x'));
  assert.equal(estado.modoMira, false);
  assert.equal(estado.mira, null);
});

test('w fija la entrada limite, q y e marcan niveles, r entra a mercado y todo se dibuja', () => {
  const { app, estado } = monitorConVelas();
  app.update(estado, tecla('w'));
  assert.equal(estado.borrador.entrada, null, 'sin mira no marca');

  app.update(estado, tecla('x'));
  app.update(estado, tecla('w'));
  app.update(estado, tecla('k'));
  app.update(estado, tecla('k'));
  app.update(estado, tecla('q'));
  for (let i = 0; i < 5; i++) app.update(estado, tecla('j'));
  app.update(estado, tecla('e'));
  const { entrada, take_profit, stop_loss } = estado.borrador;
  assert.match(entrada, /^\d+$/, 'redondea a los decimales de las velas');
  assert.equal(estado.borrador.tipo, 'limite', 'w fija una entrada limite');
  assert.ok(Number(take_profit) > Number(entrada) && Number(stop_loss) < Number(entrada));

  app.update(estado, tecla('x'));
  const lineas = flatten(app.view(estado), 80, 24).map(linea => sanitize(linea.content));
  assert.ok(lineas.filter(linea => linea.includes('┄')).length >= 3, 'una linea por nivel');
  assert.ok(lineas.some(linea => linea.includes('│ ' + take_profit + ' ')), 'el precio del nivel va en el eje');

  app.update(estado, tecla('r'));
  assert.equal(estado.borrador.tipo, 'mercado', 'r toma una entrada a mercado');
  assert.equal(estado.borrador.entrada, estado.velas.at(-1).close, 'al ultimo precio');
  app.update(estado, tecla('c'));
  assert.deepEqual(estado.borrador, { tipo: null, entrada: null, take_profit: null, stop_loss: null });
});

test('cambiar de simbolo descarta el borrador', async () => {
  const { estado, seleccionar, fijarNivel } = crearEstado({ simbolos: ['BTCUSDT', 'ETHUSDT'], cargarVelas: async () => [] });
  fijarNivel('take_profit', '110');
  await seleccionar('ETHUSDT');
  assert.equal(estado.borrador.take_profit, null);
});

test('l desplaza pasada la ultima vela y la mira sigue hacia los lugares vacios', () => {
  const { app, estado } = monitorConVelas();
  estado.zoomX = 20;
  app.update(estado, tecla('l'));
  assert.equal(estado.offset, -1, 'el grafico deja un lugar vacio a la derecha');
  app.update(estado, tecla('h'));
  assert.equal(estado.offset, 0);

  app.update(estado, tecla('x'));
  const ultima = estado.mira.col;
  app.update(estado, tecla('l'));
  assert.equal(estado.offset, -1, 'en el borde la mira desplaza el grafico');
  assert.equal(estado.mira.col, ultima, 'y queda en su columna, sobre el lugar vacio');
  const titulo = flatten(app.view(estado), 80, 24).map(linea => sanitize(linea.content))[1];
  assert.match(titulo, /\| vela:- \| -/, 'sobre un lugar vacio la cabecera solo muestra el precio');

  app.update(estado, tecla('h'));
  assert.ok(estado.mira.col < ultima, 'h vuelve a las velas');
});

test('Enter confirma la orden con la caja enfocada y en la watchlist solo selecciona', () => {
  const anterior = process.stdout.columns;
  process.stdout.columns = 140;
  try {
    const { app, estado } = monitorConVelas();
    const pantalla = () => flatten(app.view(estado), 140, 30).map(linea => sanitize(linea.content));
    app.update(estado, tecla('x'));
    for (let i = 0; i < 2; i++) app.update(estado, tecla('k'));
    app.update(estado, tecla('q'));
    app.update(estado, tecla('r'));
    app.update(estado, tecla('Enter'));
    assert.equal(estado.operaciones.length, 0, 'con el foco en el grafico Enter no confirma');
    assert.ok(pantalla().some(linea => linea.includes('CONFIRMAR (Enter)')));

    app.update(estado, tecla('Tab'));
    app.update(estado, tecla('Enter'));
    assert.equal(estado.operaciones.length, 1);
    assert.equal(estado.operaciones[0].tipo, 'mercado');
    assert.equal(estado.foco, 'grafico', 'la caja cierra y el foco vuelve al grafico');
    assert.ok(pantalla().filter(linea => linea.includes('┄')).length >= 2, 'la operacion viva deja sus lineas');

    app.update(estado, tecla('q'));
    app.update(estado, tecla('Tab'));
    app.update(estado, tecla('Enter'));
    assert.equal(estado.operaciones.length, 1, 'un borrador invalido no crea otra');
    assert.ok(pantalla().some(linea => linea.includes('err: falta la entrada')));

    app.update(estado, tecla('Tab'));
    app.update(estado, tecla('Enter'));
    assert.equal(estado.foco, 'grafico', 'en la watchlist Enter selecciona y vuelve al grafico');
    assert.equal(estado.operaciones.length, 1, 'y no confirma la orden');
  } finally {
    process.stdout.columns = anterior;
  }
});

test('la caja de la orden abre con el borrador, muestra la vista previa y cierra al confirmar', () => {
  const anterior = process.stdout.columns;
  process.stdout.columns = 140;
  try {
    const { app, estado } = monitorConVelas();
    const pantalla = () => flatten(app.view(estado), 140, 30).map(linea => sanitize(linea.content));
    assert.ok(!pantalla().some(linea => linea.includes('orden')), 'sin borrador no hay caja');

    const horaMira = () => pantalla()[1].match(/vela:[^|]+\| ([^│]+?)\s{2,}/)?.[1];
    app.update(estado, tecla('x'));
    for (let i = 0; i < 5; i++) app.update(estado, tecla('h'));
    const vela = estado.mira.col;
    const hora = horaMira();
    for (let i = 0; i < 2; i++) app.update(estado, tecla('k'));
    app.update(estado, tecla('q'));
    assert.ok(pantalla().some(linea => linea.includes('orden')), 'un tp ya abre la caja');
    assert.ok(pantalla().some(linea => linea.includes('falta la entrada')), 'y avisa que falta');
    assert.notEqual(estado.mira.col, vela, 'el grafico se angosta');
    assert.equal(horaMira(), hora, 'y la mira sigue en la misma vela');
    app.update(estado, tecla('h'));
    app.update(estado, tecla('l'));
    const conCaja = estado.mira.col;

    for (let i = 0; i < 6; i++) app.update(estado, tecla('j'));
    app.update(estado, tecla('e'));
    app.update(estado, tecla('r'));
    app.update(estado, tecla('Tab'));
    assert.equal(estado.foco, 'orden', 'despues del grafico Tab pasa por la caja de la orden');
    app.update(estado, tecla('k'));
    assert.equal(estado.porcentaje, '15', 'con foco k sube el porcentaje');
    app.update(estado, tecla('j'));
    app.update(estado, tecla('j'));
    assert.equal(estado.porcentaje, '5');
    const crudas = flatten(app.view(estado), 140, 30).map(linea => linea.content);
    assert.ok(crudas.some(linea => linea.includes(toAnsi({ fg: 'accent', bg: 'selected' }) + 'porcentaje')), 'el porcentaje se resalta con foco');
    const lineas = crudas.map(sanitize);
    for (const texto of ['mercado', 'long', '5%', 'cartera', 'saldo', 'account']) {
      assert.ok(lineas.some(linea => linea.includes(texto)), 'falta ' + texto);
    }
    assert.ok(lineas.some(linea => /en tp\s+\+\d/.test(linea)), 'el resultado en tp con signo');
    assert.ok(lineas.some(linea => /ratio\s+\d+\.\d\d:1/.test(linea)), 'ganancia:perdida');

    app.update(estado, tecla('Enter'));
    assert.equal(estado.operaciones.length, 1);
    assert.ok(!pantalla().some(linea => linea.includes('cartera')), 'al confirmar la caja cierra');
    assert.equal(estado.foco, 'grafico', 'y el foco vuelve al grafico');
    assert.notEqual(estado.mira.col, conCaja, 'el grafico vuelve al ancho completo');
    assert.equal(horaMira(), hora, 'con la mira en la misma vela');
  } finally {
    process.stdout.columns = anterior;
  }
});

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
