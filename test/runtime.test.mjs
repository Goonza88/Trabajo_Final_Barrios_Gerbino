// tests del loop de la app - ciclo de vida, subscriptions y repintado, stdout espiado

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, stop, Sub, size } from '../backend/terminal/runtime.mjs';
import { box, rows, text } from '../backend/terminal/widgets.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// captura lo escrito con escapes (runtime) y deja pasar lo demas (reporter)
function espiar() {
  const escritos = [];
  const original = process.stdout.write;
  process.stdout.write = function (chunk, ...rest) {
    const texto = String(chunk);
    if (texto.includes('\x1b')) { escritos.push(texto); return true; }
    return original.call(process.stdout, chunk, ...rest);
  };
  return { escritos, restaurar: () => { process.stdout.write = original; } };
}

// registra cada evento recibido
function app(eventos, extra = {}) {
  return {
    init: () => ({ n: 0 }),
    update: (model, event) => { eventos.push(event); return model; },
    view: () => box(rows([text('hola')]), { border: 'round', pad: [0, 1] }),
    ...extra,
  };
}

test('size mide la terminal con fallback', () => {
  const s = size();
  assert.equal(s.cols, process.stdout.columns || 80);
  assert.equal(s.rows, process.stdout.rows || 24);
});

test('run pinta el primer frame y stop restaura', async () => {
  const s = espiar();
  try {
    const eventos = [];
    run(app(eventos));
    await sleep(50);
    stop();
    const pintado = s.escritos.join('');
    assert.match(pintado, /\x1b\[2J\x1b\[H/);   // primer frame limpia
    assert.match(pintado, /╭/);                // pinta el marco
    assert.match(pintado, /hola/);             // con contenido
    const restaurado = s.escritos.at(-1);
    assert.match(restaurado, /\x1b\[\?1049l/);  // sale de la pantalla alt
    assert.match(restaurado, /\x1b\[\?25h/);    // devuelve el cursor
  } finally { stop(); s.restaurar(); }
});

test('resize llega como evento y pinta de nuevo', async () => {
  const s = espiar();
  try {
    const eventos = [];
    run(app(eventos));
    await sleep(40);
    const antes = s.escritos.length;
    process.stdout.emit('resize');
    await sleep(40);
    const resize = eventos.find(e => e.type === 'resize');
    assert.ok(resize, 'app recibe el resize');
    assert.equal(resize.cols, process.stdout.columns || 80);
    assert.ok(s.escritos.length > antes, 'resize repinta todo');
  } finally { stop(); s.restaurar(); }
});

test('Sub.timeout se dispara una sola vez aunque el tick tarde', async () => {
  const s = espiar();
  try {
    const eventos = [];
    run(app(eventos, { subscriptions: [Sub.timeout(20, 'arranque')] }));
    await sleep(90); // mas que el timeout
    const ticks = eventos.filter(e => e.type === 'sub:tick' && e.tag === 'arranque');
    assert.equal(ticks.length, 1);
  } finally { stop(); s.restaurar(); }
});

test('Sub.interval repite y despues de stop no llega ninguno', async () => {
  const s = espiar();
  try {
    const eventos = [];
    run(app(eventos, { subscriptions: [Sub.interval(20, 'reloj')] }));
    await sleep(70);
    stop();
    const antes = eventos.filter(e => e.type === 'sub:tick' && e.tag === 'reloj').length;
    assert.ok(antes >= 2, 'al menos dos ticks llegaron ' + antes);
    await sleep(60);
    assert.equal(eventos.filter(e => e.type === 'sub:tick' && e.tag === 'reloj').length, antes, 'stop corto los ticks');
  } finally { stop(); s.restaurar(); }
});

test('stop cancela timeouts pendientes', async () => {
  const s = espiar();
  try {
    const eventos = [];
    run(app(eventos, { subscriptions: [Sub.timeout(40, 'despues')] }));
    stop(); // para ni bien arranca
    await sleep(80);
    assert.equal(eventos.filter(e => e.type === 'sub:tick' && e.tag === 'despues').length, 0);
  } finally { stop(); s.restaurar(); }
});

test('puede parar y volver a arrancar', async () => {
  const s = espiar();
  try {
    const eventosA = [];
    run(app(eventosA, { subscriptions: [Sub.interval(20, 'A')] }));
    await sleep(50);
    stop();
    const ticksA = eventosA.filter(e => e.type === 'sub:tick' && e.tag === 'A').length;
    assert.ok(ticksA >= 1, 'primer arranque funciono');

    const eventosB = [];
    run(app(eventosB, { subscriptions: [Sub.interval(20, 'B')] }));
    await sleep(50);
    stop();
    assert.ok(eventosB.filter(e => e.type === 'sub:tick' && e.tag === 'B').length >= 1, 'segundo arranque funciono');
    assert.equal(eventosA.filter(e => e.type === 'sub:tick' && e.tag === 'A').length, ticksA, 'primero quedo parado');
  } finally { stop(); s.restaurar(); }
});

test('run con una app corriendo tira error', () => {
  const s = espiar();
  try {
    run(app([]));
    assert.throws(() => run(app([])), /ya hay una app corriendo/);
  } finally { stop(); s.restaurar(); }
});

test('subscription desconocida tira error y no traba el runtime', async () => {
  const s = espiar();
  try {
    assert.throws(() => run({ subscriptions: [{ type: 'bogus' }] }), /subscription desconocida/);
    const eventos = [];
    run(app(eventos));
    await sleep(30);
    assert.ok(s.escritos.length > 0, 'la app arranco despues del error');
    stop();
  } finally { stop(); s.restaurar(); }
});

test('subscription invalida no deja timers vivos', async () => {
  const s = espiar();
  try {
    const eventos = [];
    assert.throws(() => run(app(eventos, {
      subscriptions: [Sub.interval(10, 'viejo'), { type: 'bogus' }],
    })), /subscription desconocida/);
    await sleep(40);
    assert.equal(eventos.filter(e => e.type === 'sub:tick').length, 0);
    run(app([]));
    stop();
  } finally { stop(); s.restaurar(); }
});

test('subscription sin ms valido tira error', () => {
  const s = espiar();
  try {
    assert.throws(() => run({ subscriptions: [Sub.interval(NaN)] }), /sin ms valido/);
  } finally { stop(); s.restaurar(); }
});