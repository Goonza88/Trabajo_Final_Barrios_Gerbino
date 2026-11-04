// alertas de nivel de la sesion y avisos de las que se dispararon - en memoria

import { crearAlerta, seguirAlertas } from '../../backend/dominio/alertas.mjs';

// alertas del diario - activas y despues disparadas, mas nueva a la mas vieja
export function alertasDiario(estado) {
  const recientes = [...estado.alertas].reverse();
  return [...recientes.filter(alerta => alerta.activa), ...recientes.filter(alerta => !alerta.activa)];
}

// suma al estado alertas y avisos y devuelve acciones
export function crearAlertas(estado, { ahora = Date.now } = {}) {
  Object.assign(estado, { alertas: [], avisos: [] });
  let ultimoId = 0;

  // alerta en nivel - cruce del ultimo precio, si no queda el error
  function agregarAlerta(valor) {
    try {
      const precio = estado.velas.at(-1)?.close;
      if (precio == null) throw new Error('sin precio para ' + estado.symbol);
      const alerta = crearAlerta({
        exchange_id: estado.exchange_id,
        symbol: estado.symbol,
        valor,
        precio,
        timeframe: estado.interval,
        ahora: ahora(),
      });
      estado.alertas = [...estado.alertas, { id: ++ultimoId, ...alerta }];
    } catch (e) {
      estado.error_orden = { mensaje: e.message, en: ahora() };
    }
  }

  // dispara alertas de un simbolo y un aviso por cada una
  function seguir(symbol, velas, precio) {
    const { alertas, eventos } = seguirAlertas(estado.alertas, { symbol, velas, precio, ahora: ahora() });
    if (!eventos.length) return;
    estado.alertas = alertas;
    estado.avisos = [...estado.avisos, ...eventos.map(evento => evento.alerta)];
    estado.eventos = [...estado.eventos, ...eventos.map(evento => ({ ...evento, en: ahora() }))];
  }

  function descartarAviso() {
    estado.avisos = estado.avisos.slice(1);
  }

  // borra alerta elegida en el diario, despues de las operaciones
  function borrarAlertaSeleccionada() {
    const alerta = alertasDiario(estado)[estado.diario.cursor - estado.operaciones.length];
    if (!alerta) return;
    estado.alertas = estado.alertas.filter(actual => actual.id !== alerta.id);
    const total = estado.operaciones.length + estado.alertas.length;
    estado.diario.cursor = Math.max(0, Math.min(total - 1, estado.diario.cursor));
  }

  return { agregarAlerta, seguir, descartarAviso, borrarAlertaSeleccionada };
}
