// tests de la terminal web - la pantalla del navegador, las teclas y las sesiones del servidor

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pantalla, estiloCss, mouseABytes, teclaABytes } from '../web/publico/terminal.mjs';
import { crearServidor } from '../web/servidor.mjs';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';

const filaCon = (pantalla, texto) => pantalla.celdas.findIndex((_, r) => pantalla.texto(r).includes(texto));

test('la pantalla ubica el texto, borra y mide los caracteres anchos', () => {
  const pantalla = new Pantalla(10, 3);
  pantalla.escribir('\x1b[2;3Hhola\x1b[1;1Hxyz\x1b[1;2H\x1b[K');
  assert.equal(pantalla.texto(0), 'x         ');
  assert.equal(pantalla.texto(1), '  hola    ');
  pantalla.escribir('\x1b[3;1H界a');
  assert.equal(pantalla.celdas[2][2].c, 'a', 'el caracter ancho ocupa dos celdas');
  pantalla.escribir('\x1b[2J');
  assert.equal(pantalla.texto(1).trim(), '');
});

test('la pantalla junta los escapes cortados entre mensajes y arma tramos por estilo', () => {
  const pantalla = new Pantalla(8, 1);
  pantalla.escribir('\x1b[38;2;1;2');
  pantalla.escribir(';3m\x1b[1mab\x1b[0mc');
  const [primero, segundo] = pantalla.tramos(0);
  assert.deepEqual(primero, { texto: 'ab', estilo: { fg: 'rgb(1,2,3)', bold: true } });
  assert.equal(segundo.texto, 'c' + ' '.repeat(5));
  assert.deepEqual(estiloCss({ fg: 'red', reverse: true }, { fg: 'white', bg: 'black' }), { color: 'black', background: 'red' });
});

test('la pantalla sigue el modo mouse y marca las filas que cambian', () => {
  const pantalla = new Pantalla(4, 2);
  pantalla.tomarSucias();
  pantalla.escribir('\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h');
  assert.equal(pantalla.mouse, true);
  pantalla.tomarSucias();
  pantalla.escribir('\x1b[2;1Hz');
  assert.deepEqual(pantalla.tomarSucias(), [1]);
  pantalla.escribir('\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?1049l');
  assert.equal(pantalla.mouse, false);
});

test('las teclas del navegador se traducen a los bytes que lee el sustrato', () => {
  const tecla = (key, mods = {}) => teclaABytes({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
  assert.equal(tecla('ArrowUp'), '\x1b[A');
  assert.equal(tecla('Enter'), '\r');
  assert.equal(tecla('Backspace'), '\x7f');
  assert.equal(tecla('Tab', { shiftKey: true }), '\x1b[Z');
  assert.equal(tecla('c', { ctrlKey: true }), '\x03');
  assert.equal(tecla('x', { altKey: true }), '\x1bx');
  assert.equal(tecla('ñ'), 'ñ');
  assert.equal(tecla('Shift'), null);
  assert.equal(tecla('r', { metaKey: true }), null);
  assert.equal(mouseABytes(0, 5, 3, true), '\x1b[<0;5;3M');
});

// lee los eventos SSE de una sesion y los pasa a una pantalla
async function abrir(base, cols, rows) {
  const respuesta = await fetch(`${base}/sesion?cols=${cols}&rows=${rows}`);
  const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
  const pantalla = new Pantalla(cols, rows);
  const sesion = { pantalla, id: null, eventos: [] };
  let resto = '';
  sesion.esperar = async hasta => {
    while (!hasta()) {
      const { value, done } = await lector.read();
      if (done) return;
      resto += value;
      const partes = resto.split('\n\n');
      resto = partes.pop();
      for (const parte of partes) {
        const tipo = /^event: (.*)$/m.exec(parte)?.[1];
        const dato = /^data: (.*)$/m.exec(parte)?.[1];
        if (dato == null) continue;
        if (tipo === 'id') sesion.id = JSON.parse(dato);
        else if (tipo) sesion.eventos.push([tipo, JSON.parse(dato)]);
        else pantalla.escribir(JSON.parse(dato));
      }
    }
  };
  return sesion;
}

const enviar = (base, ruta, id, cuerpo = '', extra = '') => fetch(`${base}/${ruta}?id=${id}${extra}`, { method: 'POST', body: cuerpo });

test('el servidor corre la app por sesion, le pasa el tamaño y la cierra al salir', async () => {
  const servidor = crearServidor({ maxSesiones: 1 }).listen(0);
  await new Promise(resolve => servidor.once('listening', resolve));
  const base = `http://localhost:${servidor.address().port}`;
  try {
    const pagina = await fetch(base + '/');
    assert.match(pagina.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(await pagina.text(), /pagina\.mjs/);
    assert.equal((await fetch(base + '/main.mjs')).status, 404, 'solo se sirve lo publico');

    const sesion = await abrir(base, 70, 16);
    await sesion.esperar(() => filaCon(sesion.pantalla, 'terminal 70x16') >= 0);
    assert.ok(sesion.id);

    const otra = await abrir(base, 70, 16);
    await otra.esperar(() => otra.eventos.length);
    assert.deepEqual(otra.eventos, [['lleno', 1]], 'con el limite lleno no abre otra');

    assert.equal((await enviar(base, 'teclas', 'x', 'q')).status, 404);
    assert.equal((await enviar(base, 'teclas', sesion.id, 'x'.repeat(2000))).status, 413);

    sesion.pantalla.redimensionar(60, 12);
    await enviar(base, 'tamano', sesion.id, '', '&cols=60&rows=12');
    await sesion.esperar(() => filaCon(sesion.pantalla, 'terminal 60x12') >= 0);

    await enviar(base, 'teclas', sesion.id, 'q');
    await sesion.esperar(() => sesion.eventos.length);
    assert.deepEqual(sesion.eventos, [['fin', 'salida']]);
    assert.equal(servidor.sesiones.size, 0);
  } finally {
    await servidor.apagar();
  }
});

test('una sesion sin teclas se cierra por inactividad', async () => {
  const servidor = crearServidor({ inactividadMs: 200 }).listen(0);
  await new Promise(resolve => servidor.once('listening', resolve));
  try {
    const sesion = await abrir(`http://localhost:${servidor.address().port}`, 40, 10);
    await sesion.esperar(() => sesion.eventos.length);
    assert.deepEqual(sesion.eventos, [['fin', 'inactividad']]);
  } finally {
    await servidor.apagar();
  }
});

test('la pantalla separa los pedidos OSC de la app sin dibujarlos', () => {
  const pantalla = new Pantalla(10, 1);
  pantalla.escribir('a\x1b]7701;descargar');
  pantalla.escribir('-base\x07b\x1b]otro\x1b\\c');
  assert.equal(pantalla.texto(0).trim(), 'abc');
  assert.deepEqual(pantalla.tomarPedidos(), ['7701;descargar-base', 'otro']);
  assert.deepEqual(pantalla.tomarPedidos(), []);
});

test('el inicio web pide la base y el servidor entrega una copia con lo que sigue en el WAL', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const servidor = crearServidor().listen(0);
  await new Promise(resolve => servidor.once('listening', resolve));
  const base = `http://localhost:${servidor.address().port}`;
  try {
    const sesion = await abrir(base, 70, 16);
    await sesion.esperar(() => filaCon(sesion.pantalla, 'b descargar base') >= 0);
    await enviar(base, 'teclas', sesion.id, 'b');
    await sesion.esperar(() => sesion.pantalla.pedidos.length);
    assert.deepEqual(sesion.pantalla.tomarPedidos(), ['7701;descargar-base']);

    assert.equal((await fetch(`${base}/base?id=otra`)).status, 404);

    // la app tiene su base abierta en WAL - la watchlist que armo al arrancar todavia no paso al archivo
    const descarga = await fetch(`${base}/base?id=${sesion.id}`);
    assert.equal(descarga.status, 200);
    assert.match(descarga.headers.get('content-disposition'), /filename="app\.db"/);
    const bytes = Buffer.from(await descarga.arrayBuffer());
    assert.equal(bytes.subarray(0, 15).toString(), 'SQLite format 3');
    const archivo = path.join(mkdtempSync(path.join(os.tmpdir(), 'descarga-')), 'app.db');
    writeFileSync(archivo, bytes);
    const copia = new DatabaseSync(archivo);
    assert.deepEqual(copia.prepare('SELECT symbol FROM watchlist_item ORDER BY symbol').all().map(fila => fila.symbol), ['BTCUSDT', 'ETHUSDT']);
    copia.close();
    rmSync(path.dirname(archivo), { recursive: true });
  } finally {
    await servidor.apagar();
  }
});
