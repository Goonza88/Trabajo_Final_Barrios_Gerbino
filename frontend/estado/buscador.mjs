// buscador de simbolos para sumar a la watchlist - la lista del exchange se pide una vez por sesion

import { buscarSimbolos } from '../../backend/dominio/mercado.mjs';
import { editText } from '../../backend/terminal/input.mjs';

// simbolos que coinciden con lo escrito
export function resultadosBuscador(estado) {
  return buscarSimbolos(estado.catalogo ?? [], estado.buscador?.texto);
}

// suma al estado el buscador y la lista del exchange y devuelve sus acciones
export function crearBuscador(estado, { cargarSimbolos, validarSimbolo, agregarSimbolo }) {
  Object.assign(estado, { buscador: null, catalogo: null });
  let pedido = null;

  // abre el buscador y pide la lista si todavia no llego
  function abrirBuscador() {
    estado.buscador = { texto: '', cursor: 0, cargando: !estado.catalogo, error: null };
    if (estado.catalogo) return Promise.resolve(estado);
    pedido ??= cargarSimbolos({ exchange_id: estado.exchange_id })
      .then(lista => { estado.catalogo = lista; })
      .catch(e => {
        pedido = null;
        if (estado.buscador) estado.buscador.error = e.message;
      })
      .finally(() => {
        if (estado.buscador) estado.buscador.cargando = false;
      });
    return pedido.then(() => estado);
  }

  function cerrarBuscador() {
    estado.buscador = null;
  }

  // suma el elegido despues de confirmar que el exchange lo opera
  async function elegir() {
    const { buscador } = estado;
    const elegido = resultadosBuscador(estado)[buscador.cursor];
    if (!elegido || buscador.cargando) return estado;
    if (estado.simbolos.includes(elegido.symbol)) {
      buscador.error = 'ya esta en la watchlist: ' + elegido.symbol;
      return estado;
    }
    buscador.cargando = true;
    buscador.error = null;
    try {
      await validarSimbolo({ exchange_id: estado.exchange_id, symbol: elegido.symbol });
      cerrarBuscador();
      await agregarSimbolo(elegido.symbol);
    } catch (e) {
      if (estado.buscador) Object.assign(estado.buscador, { cargando: false, error: e.message });
    }
    return estado;
  }

  // Esc cierra, Enter suma el elegido, flechas eligen y el resto escribe en mayusculas
  function teclearBuscador(tecla) {
    const { buscador } = estado;
    if (tecla === 'Esc') return cerrarBuscador();
    if (tecla === 'Enter') return elegir();
    const total = resultadosBuscador(estado).length;
    if (tecla === 'ArrowDown') buscador.cursor = Math.max(0, Math.min(total - 1, buscador.cursor + 1));
    else if (tecla === 'ArrowUp') buscador.cursor = Math.max(0, buscador.cursor - 1);
    else {
      buscador.texto = editText(buscador.texto, tecla).value.toUpperCase();
      buscador.cursor = 0;
      buscador.error = null;
    }
  }

  return { abrirBuscador, cerrarBuscador, teclearBuscador };
}
