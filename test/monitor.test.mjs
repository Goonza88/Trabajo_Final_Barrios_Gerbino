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
