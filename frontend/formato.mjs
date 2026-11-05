// formatos para mostrar precios, montos, lados y fechas

export const LADOS = { compra: 'long', venta: 'short' };

// el dominio entrega decimales simples - para mostrarlos se sacan los ceros de mas
export function fmtPrecio(precio) {
  if (precio == null) return '-';
  const texto = String(precio);
  return texto.includes('.') ? texto.replace(/\.?0+$/, '') : texto;
}

export function fmtVariacion(valor) {
  if (valor == null) return '-';
  return (valor > 0 ? '+' : '') + valor.toFixed(2) + '%';
}

// monto en dos decimales con signo y color
export function monto(valor) {
  if (valor == null) return { text: '-' };
  const numero = Number(valor);
  return { text: (numero > 0 ? '+' : '') + numero.toFixed(2), style: numero === 0 ? '' : { fg: numero > 0 ? 'success' : 'danger' } };
}

// dia, mes y hora en 24 horas, o corto
export function fmtFecha(instante) {
  const d = new Date(instante);
  const dos = n => String(n).padStart(2, '0');
  return dos(d.getDate()) + '/' + dos(d.getMonth() + 1) + ' ' + dos(d.getHours()) + ':' + dos(d.getMinutes());
}
