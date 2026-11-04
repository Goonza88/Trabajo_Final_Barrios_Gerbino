// operaciones de practica de la sesion - borrador, operaciones y eventos en memoria

import { cancelarOperacion, cerrarOperacion, crearOperacion, editarNotas, resumenCartera, seguirOperaciones } from '../../backend/dominio/operaciones.mjs';
import { editText } from '../../backend/terminal/input.mjs';

// orden sin confirmar - tipo y niveles marcados desde la mira
const NIVELES_BORRADOR = ['take_profit', 'stop_loss'];
const borradorVacio = () => ({ tipo: null, entrada: null, take_profit: null, stop_loss: null });

// porcentaje del saldo por operacion, en pasos
const PORCENTAJE = Object.freeze({ min: 5, max: 100, paso: 5 });

// ultimo precio de cada simbolo, el del grafico desde su vela
export function preciosActuales(estado) {
  const precios = Object.fromEntries(Object.values(estado.tickers).map(ticker => [ticker.symbol, ticker.price]));
  const ultimo = estado.velas.at(-1)?.close;
  if (ultimo != null) precios[estado.symbol] = ultimo;
  return precios;
}

// tiempo que se muestra un error de orden
const DURACION_ERROR = 5000;

// mensaje del error de orden mientras no vencio, null si no hay
export function errorOrden(estado, ahora = Date.now()) {
  const error = estado.error_orden;
  return error && ahora - error.en < DURACION_ERROR ? error.mensaje : null;
}

const vivas = operacion => operacion.estado === 'abierta' || operacion.estado === 'pendiente';

// filas del diario - vivas primero y despues el resto, cada grupo de la mas nueva a la mas vieja
export function filasDiario(estado) {
  const recientes = [...estado.operaciones].reverse();
  return [...recientes.filter(vivas), ...recientes.filter(operacion => !vivas(operacion))];
}

// suma al estado lo de las operaciones y devuelve sus acciones
export function crearPractica(estado, { saldoInicial = '100', porcentaje = '10', ahora = Date.now } = {}) {
  Object.assign(estado, {
    borrador: borradorVacio(),
    operaciones: [],
    eventos: [],
    saldo_inicial: saldoInicial,
    porcentaje,
    error_orden: null,
    // fila elegida del diario y el texto de las notas mientras se editan
    diario: { cursor: 0, notas: null },
  });
  let ultimoId = 0;

  const registrar = eventos => {
    estado.eventos = [...estado.eventos, ...eventos.map(evento => ({ ...evento, en: ahora() }))];
  };

  function fijarNivel(campo, precio) {
    if (NIVELES_BORRADOR.includes(campo)) estado.borrador[campo] = precio;
  }

  // entrada limite en un precio elegido o a mercado al ultimo precio
  function fijarEntrada(tipo, precio) {
    if (tipo !== 'mercado' && tipo !== 'limite') return;
    estado.borrador.tipo = tipo;
    estado.borrador.entrada = precio;
  }

  function descartarBorrador() {
    estado.borrador = borradorVacio();
    estado.error_orden = null;
  }

  function cambiarPorcentaje(dir) {
    const siguiente = Number(estado.porcentaje) + (dir === '+' ? PORCENTAJE.paso : -PORCENTAJE.paso);
    estado.porcentaje = String(Math.max(PORCENTAJE.min, Math.min(PORCENTAJE.max, siguiente)));
  }

  // confirma el borrador con el saldo realizado - si no es valido queda el error
  function confirmarBorrador() {
    try {
      const { saldo } = resumenCartera(estado.saldo_inicial, estado.operaciones);
      const nueva = crearOperacion(estado.borrador, {
        exchange_id: estado.exchange_id,
        symbol: estado.symbol,
        saldo,
        porcentaje: estado.porcentaje,
        ahora: ahora(),
      });
      const operacion = { id: ++ultimoId, ...nueva };
      estado.operaciones = [...estado.operaciones, operacion];
      registrar([{ tipo: 'creada', operacion }]);
      descartarBorrador();
    } catch (e) {
      estado.error_orden = { mensaje: e.message, en: ahora() };
    }
  }

  // activa y cierra las operaciones de un simbolo con sus velas y precio actual
  function seguir(symbol, velas, precio) {
    const { operaciones, eventos } = seguirOperaciones(estado.operaciones, { symbol, velas, precio, ahora: ahora() });
    if (!eventos.length) return;
    estado.operaciones = operaciones;
    registrar(eventos);
  }

  const seleccionada = () => filasDiario(estado)[estado.diario.cursor] ?? null;

  // reemplaza una operacion por su version nueva y anota el evento si hay
  function actualizar(operacion, tipo) {
    estado.operaciones = estado.operaciones.map(actual => actual.id === operacion.id ? operacion : actual);
    if (tipo) registrar([{ tipo, operacion }]);
  }

  // corre una accion sobre la fila elegida - si no se puede queda el error
  function sobreSeleccionada(accion) {
    const operacion = seleccionada();
    if (!operacion) return;
    try {
      accion(operacion);
      estado.error_orden = null;
    } catch (e) {
      estado.error_orden = { mensaje: e.message, en: ahora() };
    }
  }

  function moverDiario(delta) {
    const total = estado.operaciones.length;
    estado.diario.cursor = Math.max(0, Math.min(total - 1, estado.diario.cursor + delta));
  }

  // cierra la elegida al ultimo precio de su simbolo - una pendiente no tiene posicion, se cancela
  function cerrarSeleccionada() {
    sobreSeleccionada(operacion => {
      if (operacion.estado === 'pendiente') throw new Error('orden pendiente sin posicion - Backspace la cancela');
      const precio = preciosActuales(estado)[operacion.symbol];
      if (precio == null) throw new Error('sin precio para ' + operacion.symbol);
      actualizar(cerrarOperacion(operacion, precio, ahora()), 'cerrada');
    });
  }

  function cancelarSeleccionada() {
    sobreSeleccionada(operacion => actualizar(cancelarOperacion(operacion, ahora()), 'cancelada'));
  }

  // las notas se editan por lineas - las escritas y vacias hasta llenar la caja, al menos una
  function empezarNotas(filas = 1) {
    const operacion = seleccionada();
    if (!operacion) return;
    const escritas = operacion.notas ? operacion.notas.split('\n') : [];
    const vacias = Math.max(1, filas - escritas.length);
    estado.diario.notas = { lineas: [...escritas, ...Array(vacias).fill('')], linea: 0 };
  }

  // guarda las lineas sin las vacias del final y termina la edicion
  function guardarNotas() {
    const { lineas } = estado.diario.notas;
    const ultima = lineas.findLastIndex(linea => linea.trim() !== '');
    sobreSeleccionada(operacion => actualizar(editarNotas(operacion, lineas.slice(0, ultima + 1).join('\n'))));
    estado.diario.notas = null;
  }

  // Enter pasa a la linea siguiente y en la ultima guarda, flechas se mueven, Esc guarda
  function teclearNotas(tecla) {
    const edicion = estado.diario.notas;
    const ultima = edicion.lineas.length - 1;
    if (tecla === 'Esc' || (tecla === 'Enter' && edicion.linea === ultima)) return guardarNotas();
    if (tecla === 'Enter' || tecla === 'ArrowDown') edicion.linea = Math.min(ultima, edicion.linea + 1);
    else if (tecla === 'ArrowUp') edicion.linea = Math.max(0, edicion.linea - 1);
    else edicion.lineas[edicion.linea] = editText(edicion.lineas[edicion.linea], tecla).value;
  }

  return {
    fijarNivel, fijarEntrada, descartarBorrador, cambiarPorcentaje, confirmarBorrador, seguir,
    moverDiario, cerrarSeleccionada, cancelarSeleccionada, empezarNotas, teclearNotas,
  };
}
