// indicadores tecnicos calculados sobre valores de mercado (senales, no dinero)

export const PERIODOS_INDICADORES = Object.freeze({
  sma: 20,
  ema: 20,
  rsi: 14,
  bollinger: 20,
  bollingerDesviaciones: 2,
});

function periodoValido(periodo) {
  if (!Number.isSafeInteger(periodo) || periodo < 1) {
    throw new Error('periodo invalido: ' + String(periodo));
  }
  return periodo;
}

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function sma(valores, periodo = 20) {
  periodoValido(periodo);
  const salida = Array(valores.length).fill(null);
  let suma = 0;
  let validos = 0;

  for (let i = 0; i < valores.length; i++) {
    const actual = numero(valores[i]);
    if (actual != null) {
      suma += actual;
      validos++;
    }

    if (i >= periodo) {
      const anterior = numero(valores[i - periodo]);
      if (anterior != null) {
        suma -= anterior;
        validos--;
      }
    }

    if (i >= periodo - 1 && validos === periodo) salida[i] = suma / periodo;
  }

  return salida;
}

export function ema(valores, periodo = 20) {
  periodoValido(periodo);
  const salida = Array(valores.length).fill(null);
  const alpha = 2 / (periodo + 1);
  let anteriores = [];
  let previa = null;

  for (let i = 0; i < valores.length; i++) {
    const actual = numero(valores[i]);
    if (actual == null) {
      anteriores = [];
      previa = null;
      continue;
    }

    if (previa == null) {
      anteriores.push(actual);
      if (anteriores.length === periodo) {
        previa = anteriores.reduce((suma, valor) => suma + valor, 0) / periodo;
        salida[i] = previa;
        anteriores = [];
      }
      continue;
    }

    previa = actual * alpha + previa * (1 - alpha);
    salida[i] = previa;
  }

  return salida;
}

export function rsi(valores, periodo = 14) {
  periodoValido(periodo);
  const salida = Array(valores.length).fill(null);
  let gananciaMedia = 0, perdidaMedia = 0;
  let inicialesGanancia = 0, inicialesPerdida = 0, cambiosValidos = 0;
  let inicializado = false;

  const calcular = () => {
    if (perdidaMedia === 0) return gananciaMedia === 0 ? 50 : 100;
    if (gananciaMedia === 0) return 0;
    const fuerza = gananciaMedia / perdidaMedia;
    return 100 - 100 / (1 + fuerza);
  };

  for (let i = 1; i < valores.length; i++) {
    const actual = numero(valores[i]);
    const anterior = numero(valores[i - 1]);
    if (actual == null || anterior == null) {
      gananciaMedia = 0;
      perdidaMedia = 0;
      inicialesGanancia = 0;
      inicialesPerdida = 0;
      cambiosValidos = 0;
      inicializado = false;
      continue;
    }
    const cambio = actual - anterior;
    const ganancia = Math.max(0, cambio);
    const perdida = Math.max(0, -cambio);
    if (!inicializado) {
      inicialesGanancia += ganancia;
      inicialesPerdida += perdida;
      cambiosValidos++;
      if (cambiosValidos === periodo) {
        gananciaMedia = inicialesGanancia / periodo;
        perdidaMedia = inicialesPerdida / periodo;
        inicializado = true;
        salida[i] = calcular();
      }
      continue;
    }
    gananciaMedia = (gananciaMedia * (periodo - 1) + ganancia) / periodo;
    perdidaMedia = (perdidaMedia * (periodo - 1) + perdida) / periodo;
    salida[i] = calcular();
  }

  return salida;
}

export function bollinger(valores, periodo = 20, desviaciones = 2) {
  periodoValido(periodo);
  if (!Number.isFinite(desviaciones) || desviaciones < 0) {
    throw new Error('desviaciones invalidas: ' + String(desviaciones));
  }

  const middle = sma(valores, periodo);
  const upper = Array(valores.length).fill(null);
  const lower = Array(valores.length).fill(null);

  for (let i = periodo - 1; i < valores.length; i++) {
    if (middle[i] == null) continue;
    const ventana = valores.slice(i - periodo + 1, i + 1).map(numero);
    if (ventana.some(valor => valor == null)) continue;
    const varianza = ventana.reduce((suma, valor) => suma + (valor - middle[i]) ** 2, 0) / periodo;
    const banda = Math.sqrt(varianza) * desviaciones;
    upper[i] = middle[i] + banda;
    lower[i] = middle[i] - banda;
  }

  return { middle, upper, lower };
}

export function calcularIndicadores(velas) {
  const cierres = velas.map(vela => vela.close);
  return {
    sma: sma(cierres, PERIODOS_INDICADORES.sma),
    ema: ema(cierres, PERIODOS_INDICADORES.ema),
    rsi: rsi(cierres, PERIODOS_INDICADORES.rsi),
    bollinger: bollinger(cierres, PERIODOS_INDICADORES.bollinger, PERIODOS_INDICADORES.bollingerDesviaciones),
    volume: velas.map(vela => numero(vela.volume)),
  };
}
