// tamaño de terminal del navegador para la app - el servidor lo carga con --import

import { readFileSync } from 'node:fs';

const archivo = process.env.TERMINAL_WEB;

// lee el tamaño que dejo el servidor y lo ubica donde el runtime lo busca
function leer() {
  try {
    const { cols, rows } = JSON.parse(readFileSync(archivo, 'utf8'));
    Object.assign(process.stdout, { columns: cols, rows });
  } catch {}
}

if (archivo && !process.stdout.isTTY) {
  leer();
  process.on('SIGWINCH', () => {
    leer();
    process.stdout.emit('resize');
  });
}