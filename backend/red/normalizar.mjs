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

function decimal(valor, campo, prefijo = 'normalizarKlines') {
  const texto = typeof valor === 'number' ? expandir(valor) : valor;
  if (typeof texto !== 'string' || !DECIMAL.test(texto)) {
    throw new Error(prefijo + ': ' + campo + ' invalido: ' + String(valor));
  }
  return texto;
}

function entero(valor, campo, prefijo = 'normalizarKlines') {
  if (valor == null || valor === '') {
    throw new Error(prefijo + ': ' + campo + ' invalido: ' + String(valor));
  }
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero < 0) {
    throw new Error(prefijo + ': ' + campo + ' invalido: ' + String(valor));
  }
  return numero;
}

function texto(valor, campo, prefijo) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new Error(prefijo + ': ' + campo + ' invalido: ' + String(valor));
  }
  return valor;
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

export function normalizarTicker(raw, { exchange_id = 'binance' } = {}) {
  const prefijo = 'normalizarTicker';
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(prefijo + ': ticker invalido');
  }
  const opcional = (campo, origen) => raw[origen] == null ? null : decimal(raw[origen], campo, prefijo);
  return {
    exchange_id: texto(exchange_id, 'exchange_id', prefijo),
    symbol: texto(raw.symbol, 'symbol', prefijo),
    timestamp: entero(raw.closeTime, 'timestamp', prefijo),
    price: decimal(raw.lastPrice, 'price', prefijo),
    open_24h: opcional('open_24h', 'openPrice'),
    high_24h: opcional('high_24h', 'highPrice'),
    low_24h: opcional('low_24h', 'lowPrice'),
    volume_24h: opcional('volume_24h', 'volume'),
    quote_volume_24h: opcional('quote_volume_24h', 'quoteVolume')
  };
}

export function normalizarTickers(tickers, meta) {
  if (Array.isArray(tickers)) return tickers.map(t => normalizarTicker(t, meta));
  if (tickers && typeof tickers === 'object') return [normalizarTicker(tickers, meta)];
  throw new Error('normalizarTicker: ticker invalido');
}
