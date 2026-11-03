// casos de uso de indicadores - elige periodos y aplica calculos de metricas a velas/tickers

import { sma, ema, rsi, bollinger, variacionPorcentual } from '../metricas/indicadores.mjs';

const PERIODOS = Object.freeze({
  sma: 20,
  ema: 20,
  rsi: 14,
  bollinger: 20,
  bollingerDesviaciones: 2,
});

// cada serie viaja con los parametros que la generaron
export function calcularIndicadores(velas) {
  const cierres = velas.map(vela => vela.close);
  return {
    sma: { periodo: PERIODOS.sma, valores: sma(cierres, PERIODOS.sma) },
    ema: { periodo: PERIODOS.ema, valores: ema(cierres, PERIODOS.ema) },
    rsi: { periodo: PERIODOS.rsi, valores: rsi(cierres, PERIODOS.rsi) },
    bollinger: {
      periodo: PERIODOS.bollinger,
      desviaciones: PERIODOS.bollingerDesviaciones,
      ...bollinger(cierres, PERIODOS.bollinger, PERIODOS.bollingerDesviaciones),
    },
    volume: { valores: velas.map(vela => Number(vela.volume)) },
  };
}

// variacion de 24h de un ticker, en porcentaje
export function calcularVariacion(ticker) {
  return variacionPorcentual(ticker?.price, ticker?.open_24h);
}
