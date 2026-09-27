// menu de pruebas - elige un demo, lo ejecuta y cuando sale vuelve a preguntar

import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';

const DEMOS = [ // demos del substrato de test/
  ['view',    'widgets, layout e input de una linea'],
  ['runtime', 'reloj, cola de eventos, resize y errores'],
  ['input',   'ansi y teclado crudo, sin usar el runtime'],
];

async function correr(nombre) { // ejecuta en otro proceso y espera a que termine
  const hijo = spawn(process.execPath, [`./test/${nombre}-demo.mjs`], { stdio: 'inherit' });
  await new Promise(resolve => hijo.on('exit', resolve));
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.on('close', () => process.exit(0)); // Ctrl+D cierra todo

while (true) {
  console.clear();
  console.log('demos del sustrato de la terminal\n');
  DEMOS.forEach(([nombre, que], i) => console.log(`  ${i + 1}) ${nombre.padEnd(9)} ${que}`));
  console.log('\n  0) salir');

  const i = Number((await rl.question('\nelegi uno: ')).trim());
  if (i === 0) break; // un enter solo tambien cierra todo
  if (!DEMOS[i - 1]) { console.log('Ese no existe.'); continue; }

  rl.pause(); // soltamos stdin mientras el demo ejecuta
  await correr(DEMOS[i - 1][0]);
  rl.resume();
}

rl.close(); // permite que el proceso termine y suelta stdin