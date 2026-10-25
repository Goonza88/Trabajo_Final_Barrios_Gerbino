// aritmetica decimal exacta para precios/cantidades/fees
// escala 10^8 para cubrir la precision de binance

export const ESCALA = 100000000n;

const DECIMAL = /^\d+(\.\d{1,8})?$/;

function validar(str) {
  if (typeof str !== 'string' || !DECIMAL.test(str)) {
    throw new Error('decimal invalido: ' + String(str));
  }
  return str;
}

export function parse(str) {
  const s = validar(str);
  const i = s.indexOf('.');
  if (i === -1) return BigInt(s) * ESCALA;
  const entera = s.slice(0, i);
  let frac = s.slice(i + 1);
  if (frac.length > 8) frac = frac.slice(0, 8);
  while (frac.length < 8) frac += '0';
  const num = (entera === '' ? '0' : entera) + frac;
  return BigInt(num);
}

export function formatear(val) {
  if (typeof val !== 'bigint') val = BigInt(val);
  const neg = val < 0n;
  let v = neg ? -val : val;
  const entera = v / ESCALA;
  let frac = v % ESCALA;
  if (frac === 0n) return (neg ? '-' : '') + entera.toString();
  let fstr = frac.toString().padStart(8, '0');
  fstr = fstr.replace(/0+$/, '');
  return (neg ? '-' : '') + entera.toString() + '.' + fstr;
}

export function sumar(a, b) { return parse(a) + parse(b); }
export function restar(a, b) { return parse(a) - parse(b); }
export function comparar(a, b) {
  const x = parse(a), y = parse(b);
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}