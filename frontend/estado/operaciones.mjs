// operaciones de practica de la sesion - borrador, operaciones y eventos en memoria

import { crearOperacion, resumenCartera, seguirOperaciones } from '../../backend/dominio/operaciones.mjs';

// orden sin confirmar - tipo y niveles marcados desde la mira
const NIVELES_BORRADOR = ['take_profit', 'stop_loss'];
const borradorVacio = () => ({ tipo: null, entrada: null, take_profit: null, stop_loss: null });

// porcentaje del saldo por operacion, en pasos
const PORCENTAJE = Object.freeze({ min: 5, max: 100, paso: 5 });

// suma al estado lo de las operaciones y devuelve sus acciones
export function crearPractica(estado, { saldoInicial = '100', porcentaje = '10', ahora = Date.now } = {}) {
  Object.assign(estado, {
    borrador: borradorVacio(),
    operaciones: [],
    eventos: [],
    saldo_inicial: saldoInicial,
    porcentaje,
    error_orden: null,
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
      estado.error_orden = e.message;
    }
  }

  // activa y cierra las operaciones de un simbolo con sus velas y precio actual
  function seguir(symbol, velas, precio) {
    const { operaciones, eventos } = seguirOperaciones(estado.operaciones, { symbol, velas, precio, ahora: ahora() });
    if (!eventos.length) return;
    estado.operaciones = operaciones;
    registrar(eventos);
  }

  return { fijarNivel, fijarEntrada, descartarBorrador, cambiarPorcentaje, confirmarBorrador, seguir };
}
