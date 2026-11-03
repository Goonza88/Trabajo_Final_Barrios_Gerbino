// tests de capas - cada capa solo pide a la inferior (docs/arquitectura.md)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function modulos(carpeta) {
  return readdirSync(path.join(RAIZ, carpeta), { recursive: true })
    .filter(archivo => archivo.endsWith('.mjs'))
    .map(archivo => path.join(carpeta, archivo));
}

// imports relativos de un modulo, como rutas desde la raiz
function imports(modulo) {
  const codigo = readFileSync(path.join(RAIZ, modulo), 'utf8');
  return [...codigo.matchAll(/from\s+'(\.[^']+)'/g)]
    .map(([, ruta]) => path.relative(RAIZ, path.resolve(RAIZ, path.dirname(modulo), ruta)));
}

test('la interfaz solo pide al dominio y pinta con el sustrato', () => {
  const permitidos = ['frontend/', 'backend/dominio/', 'backend/terminal/'];
  for (const modulo of modulos('frontend')) {
    for (const ruta of imports(modulo)) {
      assert.ok(permitidos.some(prefijo => ruta.startsWith(prefijo)), modulo + ' importa ' + ruta);
    }
  }
});

test('el backend no importa la interfaz', () => {
  for (const modulo of modulos('backend')) {
    for (const ruta of imports(modulo)) {
      assert.ok(!ruta.startsWith('frontend/'), modulo + ' importa ' + ruta);
    }
  }
});
