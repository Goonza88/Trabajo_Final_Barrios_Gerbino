// aritmetica decimal exacta para precios/cantidades/fees
// la precision se fija en DECIMALES - la escala y la validacion salen de ahi

export const DECIMALES = 8;
export const ESCALA = 10n ** BigInt(DECIMALES);

const DECIMAL = new RegExp(`^\\d+(\\.\\d{1,${DECIMALES}})?$`);

function validar(str) {
  if (typeof str !== 'string' || !DECIMAL.test(str)) {
    throw new Error('decimal invalido: ' + String(str));
  }
  return str;
}

export function parse(str) {
  const [entera, frac = ''] = validar(str).split('.');
  return BigInt(entera + frac.padEnd(DECIMALES, '0'));
}

export function formatear(val) {
  if (typeof val !== 'bigint') val = BigInt(val);
  const neg = val < 0n;
  const v = neg ? -val : val;
  const entera = v / ESCALA;
  const frac = v % ESCALA;
  if (frac === 0n) return (neg ? '-' : '') + entera.toString();
  const fstr = frac.toString().padStart(DECIMALES, '0').replace(/0+$/, '');
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

// multiplicacion y division truncan lo que pase de la constante, una vez por cuenta
export function multiplicar(a, b) { return parse(a) * parse(b) / ESCALA; }
export function dividir(a, b) {
  const divisor = parse(b);
  if (divisor === 0n) throw new Error('division por cero');
  return parse(a) * ESCALA / divisor;
}