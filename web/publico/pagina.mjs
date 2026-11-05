// la pagina - abre una sesion, pinta la pantalla y manda teclas, mouse y tamaño al servidor

import { Pantalla, estiloCss, mouseABytes, teclaABytes } from './terminal.mjs';

const pre = document.getElementById('pantalla');
const aviso = document.getElementById('aviso');
const nota = document.getElementById('nota');
const raiz = getComputedStyle(document.documentElement);
const colores = { fg: raiz.getPropertyValue('--fg').trim(), bg: raiz.getPropertyValue('--bg').trim() };

let pantalla = null;
let fuente = null;
let id = null;
let filas = [];
let cola = Promise.resolve();
let pintado = false;
let boton = null;

const PEDIR_BASE = '7701;descargar-base';

// medida de una celda con la fuente del navegador
function celda() {
  const prueba = document.createElement('div');
  prueba.textContent = 'M'.repeat(50);
  prueba.style.display = 'inline-block';
  pre.append(prueba);
  const { width, height } = prueba.getBoundingClientRect();
  prueba.remove();
  return { ancho: width / 50, alto: height };
}

function tamano() {
  const { ancho, alto } = celda();
  return { cols: Math.max(20, Math.floor(innerWidth / ancho)), rows: Math.max(8, Math.floor(innerHeight / alto)) };
}

function armarFilas() {
  filas = Array.from({ length: pantalla.rows }, () => document.createElement('div'));
  pre.replaceChildren(...filas);
}

function pedirPintado() {
  if (pintado) return;
  pintado = true;
  requestAnimationFrame(() => {
    pintado = false;
    for (const r of pantalla.tomarSucias()) {
      filas[r].replaceChildren(...pantalla.tramos(r).map(({ texto, estilo }) => {
        const span = document.createElement('span');
        span.textContent = texto;
        Object.assign(span.style, estiloCss(estilo, colores));
        return span;
      }));
    }
  });
}

function mostrar(texto) {
  aviso.textContent = texto;
  aviso.hidden = !texto;
}

// envios en fila para que las teclas lleguen en orden
function enviar(ruta, cuerpo, extra = '') {
  if (!id) return;
  const url = `${ruta}?id=${id}${extra}`;
  cola = cola.then(() => fetch(url, { method: 'POST', body: cuerpo }).catch(() => {}));
}

function conectar() {
  const { cols, rows } = tamano();
  pantalla = new Pantalla(cols, rows);
  armarFilas();
  mostrar('conectando...');
  fuente = new EventSource(`sesion?cols=${cols}&rows=${rows}`);
  fuente.addEventListener('id', evento => {
    id = JSON.parse(evento.data);
    mostrar('');
    pre.focus();
  });
  fuente.onmessage = evento => {
    pantalla.escribir(JSON.parse(evento.data));
    for (const pedido of pantalla.tomarPedidos()) if (pedido === PEDIR_BASE) descargarBase();
    pedirPintado();
  };
  fuente.addEventListener('lleno', () => cerrar('hay demasiadas sesiones abiertas\nEnter para volver a intentar'));
  fuente.addEventListener('fin', evento => {
    const motivo = JSON.parse(evento.data);
    cerrar((motivo === 'inactividad' ? 'la sesion se cerro por inactividad' : 'la sesion termino') + '\nEnter para empezar otra');
  });
  // cada conexion es una sesion nueva sin reconexion
  fuente.onerror = () => cerrar('se perdio la conexion con el servidor\nEnter para volver a conectar');
}

// baja la base de datos como app.db, para seguir en la terminal local
async function descargarBase() {
  const respuesta = await fetch(`base?id=${id}`).catch(() => null);
  if (!respuesta?.ok) return anotar(respuesta ? await respuesta.text() : 'no se pudo descargar la base');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(await respuesta.blob());
  enlace.download = 'app.db';
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
}

// mensaje corto sobre la pantalla, sin cortar la sesion
let notaTimer = null;
function anotar(texto) {
  nota.textContent = texto;
  nota.hidden = false;
  clearTimeout(notaTimer);
  notaTimer = setTimeout(() => { nota.hidden = true; }, 4000);
}

function cerrar(texto) {
  fuente?.close();
  fuente = null;
  id = null;
  mostrar(texto);
}

addEventListener('keydown', evento => {
  if (!fuente) {
    if (evento.key === 'Enter') conectar();
    return;
  }
  const bytes = teclaABytes(evento);
  if (bytes == null) return;
  evento.preventDefault();
  enviar('teclas', bytes);
});

addEventListener('paste', evento => {
  const texto = evento.clipboardData?.getData('text');
  if (texto) enviar('teclas', texto.slice(0, 1024));
});

// posicion del mouse en celdas, desde 1
function lugar(evento) {
  const { ancho, alto } = celda();
  const caja = pre.getBoundingClientRect();
  return [Math.floor((evento.clientX - caja.left) / ancho) + 1, Math.floor((evento.clientY - caja.top) / alto) + 1];
}

pre.addEventListener('mousedown', evento => {
  if (!pantalla?.mouse || evento.button > 2) return;
  boton = evento.button;
  enviar('teclas', mouseABytes(boton, ...lugar(evento), true));
});
addEventListener('mouseup', evento => {
  if (boton == null) return;
  enviar('teclas', mouseABytes(boton, ...lugar(evento), false));
  boton = null;
});
pre.addEventListener('mousemove', evento => {
  if (boton != null && evento.buttons) enviar('teclas', mouseABytes(boton + 32, ...lugar(evento), true));
});
pre.addEventListener('wheel', evento => {
  if (!pantalla?.mouse) return;
  evento.preventDefault();
  enviar('teclas', mouseABytes(evento.deltaY < 0 ? 64 : 65, ...lugar(evento), true));
}, { passive: false });
pre.addEventListener('contextmenu', evento => evento.preventDefault());

// al cambiar la ventana la app recibe el tamaño nuevo y repinta
let espera = null;
addEventListener('resize', () => {
  clearTimeout(espera);
  espera = setTimeout(() => {
    if (!pantalla) return;
    const { cols, rows } = tamano();
    if (cols === pantalla.cols && rows === pantalla.rows) return;
    pantalla.redimensionar(cols, rows);
    armarFilas();
    pedirPintado();
    enviar('tamano', '', `&cols=${cols}&rows=${rows}`);
  }, 150);
});

conectar();