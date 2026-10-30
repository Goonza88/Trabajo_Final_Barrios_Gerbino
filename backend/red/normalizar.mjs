const DECIMAL = /^\d+(?:\.\d{1,8})?$/;

// expande la notacion cientifica de un number sin perder digitos
function expandir(valor) {
  const match = /^(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(String(valor));
  if (!match) return String(valor);
  const entero = match[1];
  const fraccion = match[2] || '';
  const digitos = entero + fraccion;
  const punto = entero.length + Number(match[3]);
  if (punto <= 0) return '0.' + '0'.repeat(-punto) + digitos;
  if (punto >= digitos.length) return digitos + '0'.repeat(punto - digitos.length);
  return digitos.slice(0, punto) + '.' + digitos.slice(punto);
}

function decimal(valor, campo) {
  const texto = typeof valor === 'number' ? expandir(valor) : valor;
  if (typeof texto !== 'string' || !DECIMAL.test(texto)) {
    throw new Error('normalizarKlines: ' + campo + ' invalido: ' + String(valor));
  }
  return texto;
}

function entero(valor, campo) {
  if (valor == null || valor === '') {
    throw new Error('normalizarKlines: ' + campo + ' invalido: ' + String(valor));
  }
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < 0) {
    throw new Error('normalizarKlines: ' + campo + ' invalido: ' + String(valor));
  }
  return numero;
}

export function normalizarKlines(velas, { exchange_id = 'binance', symbol, interval } = {}) {
  if (!Array.isArray(velas)) throw new Error('se espera una lista de velas');
  const ahora = Date.now();
  const out = [];
  for (let i = 0; i < velas.length; i++) {
    const v = velas[i];
    if (!Array.isArray(v)) throw new Error('normalizarKlines: vela invalida en ' + i);
    out.push({
      exchange_id,
      symbol,
      interval,
      open_time: entero(v[0], 'open_time'),
      open: decimal(v[1], 'open'),
      high: decimal(v[2], 'high'),
      low: decimal(v[3], 'low'),
      close: decimal(v[4], 'close'),
      volume: decimal(v[5], 'volume'),
      close_time: entero(v[6], 'close_time'),
      quote_volume: decimal(v[7], 'quote_volume'),
      trades: v[8] == null ? null : entero(v[8], 'trades'),
      ingested_at: ahora
    });
  }
  return out;
}