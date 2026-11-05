// servidor - corre un monitor por visitante, conectado al navegador (salida por SSE, teclas y tamaño por POST)

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(WEB, '..');
const JS = 'text/javascript; charset=utf-8';

// lo unico que se sirve al navegador
const ARCHIVOS = {
  '/': [path.join(WEB, 'publico/index.html'), 'text/html; charset=utf-8'],
  '/pagina.mjs': [path.join(WEB, 'publico/pagina.mjs'), JS],
  '/terminal.mjs': [path.join(WEB, 'publico/terminal.mjs'), JS],
  '/backend/terminal/ansi.mjs': [path.join(RAIZ, 'backend/terminal/ansi.mjs'), JS],
};

const SEGURIDAD = { 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'", 'X-Content-Type-Options': 'nosniff' };

const entero = (valor, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(valor)) || min));

export function crearServidor({
  programa = path.join(RAIZ, 'main.mjs'),
  maxSesiones = 6,
  inactividadMs = 15 * 60_000,
  latidoMs = 20_000,
} = {}) {
  const sesiones = new Map();
  const carpeta = mkdtempSync(path.join(os.tmpdir(), 'terminal-web-'));
  const importar = '--import=' + pathToFileURL(path.join(WEB, 'sesion.mjs')).href;

  // cada evento SSE lleva el texto como JSON para que los saltos de linea no lo corten
  const enviar = (res, datos, evento) => res.write((evento ? `event: ${evento}\n` : '') + `data: ${JSON.stringify(datos)}\n\n`);

  function abrir(req, res, url) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', ...SEGURIDAD });
    if (sesiones.size >= maxSesiones) return res.end(`event: lleno\ndata: ${maxSesiones}\n\n`);

    const id = randomUUID();
    const tamano = path.join(carpeta, id + '.json');
    const base = path.join(carpeta, id + '.db');
    escribirTamano(tamano, url);
    const hijo = spawn(process.execPath, [programa], {
      cwd: RAIZ,
      detached: true,
      env: { ...process.env, NODE_OPTIONS: importar, TERMINAL_WEB: tamano, BASE_DATOS: base },
    });
    const sesion = { id, hijo, res, tamano, base, terminada: false, inactividad: null, latido: null };
    sesiones.set(id, sesion);

    const decoder = new StringDecoder('utf8');
    const salida = chunk => {
      const texto = decoder.write(chunk);
      if (texto) enviar(res, texto);
    };
    hijo.stdout.on('data', salida);
    hijo.stderr.on('data', salida);
    hijo.stdin.on('error', () => {});
    hijo.on('error', () => terminar(sesion, 'error'));
    hijo.on('exit', () => terminar(sesion, 'salida'));
    res.on('close', () => terminar(sesion, 'cerrada'));

    sesion.latido = setInterval(() => res.write(': latido\n\n'), latidoMs);
    actividad(sesion);
    enviar(res, id, 'id');
  }

  // reinicia la cuenta de inactividad - en timeout la sesion se cierra
  function actividad(sesion) {
    clearTimeout(sesion.inactividad);
    sesion.inactividad = setTimeout(() => terminar(sesion, 'inactividad'), inactividadMs);
  }

  // cierra la sesion una sola vez - app recibe SIGTERM y sale limpia
  function terminar(sesion, motivo) {
    if (sesion.terminada) return;
    sesion.terminada = true;
    sesiones.delete(sesion.id);
    clearTimeout(sesion.inactividad);
    clearInterval(sesion.latido);
    senal(sesion, 'SIGTERM');
    setTimeout(() => senal(sesion, 'SIGKILL'), 2000).unref();
    for (const archivo of [sesion.tamano, sesion.base, sesion.base + '-wal', sesion.base + '-shm']) rmSync(archivo, { force: true });
    if (!sesion.res.writableEnded) {
      enviar(sesion.res, motivo, 'fin');
      sesion.res.end();
    }
  }

  // la señal va al grupo, asi tambien llega a las demos
  function senal(sesion, nombre) {
    try { process.kill(-sesion.hijo.pid, nombre); } catch {}
  }

  function escribirTamano(archivo, url) {
    const cols = entero(url.searchParams.get('cols'), 20, 400);
    const rows = entero(url.searchParams.get('rows'), 8, 200);
    writeFileSync(archivo, JSON.stringify({ cols, rows }));
  }

  async function atender(req, res) {
    const url = new URL(req.url, 'http://local');
    const responder = (codigo, cuerpo = '', tipo = 'text/plain; charset=utf-8', extra = {}) => {
      res.writeHead(codigo, { 'Content-Type': tipo, ...SEGURIDAD, ...extra });
      res.end(cuerpo);
    };

    if (req.method === 'GET' && url.pathname === '/sesion') return abrir(req, res, url);
    if (req.method === 'GET' && ARCHIVOS[url.pathname]) {
      const [archivo, tipo] = ARCHIVOS[url.pathname];
      return responder(200, await readFile(archivo), tipo);
    }
    if (req.method === 'GET' && url.pathname === '/base') {
      const sesion = sesiones.get(url.searchParams.get('id'));
      if (!sesion) return responder(404, 'sesion inexistente');
      if (!existsSync(sesion.base)) return responder(404, 'la sesion todavia no tiene base de datos');
      return responder(200, await copiarBase(sesion.base), 'application/vnd.sqlite3', { 'Content-Disposition': 'attachment; filename="app.db"' });
    }
    if (req.method !== 'POST') return responder(404, 'no encontrado');

    const sesion = sesiones.get(url.searchParams.get('id'));
    if (!sesion) return responder(404, 'sesion inexistente');

    if (url.pathname === '/teclas') {
      const cuerpo = await leerCuerpo(req, 1024);
      if (!cuerpo) return responder(413, 'demasiado largo');
      sesion.hijo.stdin.write(cuerpo);
      actividad(sesion);
      return responder(204);
    }
    if (url.pathname === '/tamano') {
      escribirTamano(sesion.tamano, url);
      senal(sesion, 'SIGWINCH');
      return responder(204);
    }
    responder(404, 'no encontrado');
  }

  const servidor = http.createServer((req, res) => atender(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }));

  // al apagar el servidor no quedan apps corriendo
  servidor.apagar = () => new Promise(resolve => {
    for (const sesion of [...sesiones.values()]) terminar(sesion, 'apagado');
    servidor.close(() => {
      rmSync(carpeta, { recursive: true, force: true });
      resolve();
    });
  });
  servidor.sesiones = sesiones;
  return servidor;
}

// junta el cuerpo del POST - null si pasa limite, lo que sobra se lee y se descarta
function leerCuerpo(req, limite) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let largo = 0;
    req.on('data', parte => {
      largo += parte.length;
      if (largo <= limite) partes.push(parte);
    });
    req.on('end', () => resolve(largo > limite ? null : Buffer.concat(partes)));
    req.on('error', reject);
  });
}

// copia consistente de la base de la sesion
async function copiarBase(base) {
  const { DatabaseSync } = await import('node:sqlite');
  const copia = base + '.copia';
  rmSync(copia, { force: true });
  const db = new DatabaseSync(base);
  try {
    db.prepare('VACUUM INTO ?').run(copia); // incluye lo que sigue en el WAL
  } finally {
    db.close();
  }
  try {
    return await readFile(copia);
  } finally {
    rmSync(copia, { force: true });
  }
}

// el host define el puerto con PORT
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const servidor = crearServidor().listen(Number(process.env.PORT) || 8080);
  process.on('SIGTERM', () => servidor.apagar().then(() => process.exit(0)));
}