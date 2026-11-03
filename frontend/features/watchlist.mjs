// watchlist y ticker con precio en vivo y variacion de 24h

import { box, gap, rows, table, text } from '../../backend/terminal/widgets.mjs';
import { boxSize } from '../../backend/terminal/layout.mjs';
import { sanitize, textWidth } from '../../backend/terminal/ansi.mjs';

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

// ancho minimo para que ninguna linea de ayuda se corte ni haga wrap, plegada o no
export function anchoWatchlist(ayuda = []) {
  const lineas = ayuda.flatMap(({ lineas, resumen }) => resumen ? [...lineas, resumen] : lineas);
  return Math.max(30, ...lineas.map(linea => textWidth(linea) + 4));
}

// formas de la ayuda - sin lineas vacias > plegando secciones
function formasAyuda(secciones) {
  const armar = (plegadas, separar) => {
    let resto = plegadas;
    return secciones
      .map(({ lineas, resumen }) => resumen && resto-- > 0 ? [resumen] : lineas)
      .flatMap((bloque, i) => separar && i > 0 ? ['', ...bloque] : bloque);
  };
  const plegables = secciones.filter(seccion => seccion.resumen).length;
  return [armar(0, true), ...Array.from({ length: plegables + 1 }, (_, k) => armar(k, false))];
}

// la watchlist es el ticker - al final muestra la ayuda por secciones que le pasa la vista
export function vistaWatchlist(estado, { width, height, ayuda }) {
  const marco = {
    border: 'round',
    pad: [0, 1],
    height,
    borderStyle: estado.foco === 'watchlist' ? { fg: 'accent' } : null
  };
  const { innerH } = boxSize(marco, width);
  const { simbolos, tickers, cursor } = estado;
  const error = estado.tickers_error ? sanitize(estado.tickers_error) : null;
  const alto = innerH;
  const extraError = error ? 1 : 0;
  // la ayuda se achica hasta que entren todos los simbolos, y si ni plegada entran, la lista se desplaza
  const formas = formasAyuda(ayuda);
  const ayudas = formas.find(forma => alto >= 4 + Math.max(1, simbolos.length) + forma.length + extraError)
    ?? formas.at(-1);
  const conSeparacion = alto >= 4 + 1 + ayudas.length + extraError;
  const overhead = conSeparacion ? 4 : 2;
  const maxFilas = Math.max(0, alto - overhead - ayudas.length - extraError);
  const maxInicio = Math.max(0, simbolos.length - maxFilas);
  const inicio = maxFilas > 0 ? Math.max(0, Math.min(cursor - maxFilas + 1, maxInicio)) : 0;
  const visibles = maxFilas > 0 ? simbolos.slice(inicio, inicio + maxFilas) : [];
  const filas = visibles.map((symbol, i) => {
    const ticker = tickers[symbol];
    const valor = estado.variaciones[symbol];
    const estiloValor = valor == null || valor === 0 ? null : { fg: valor > 0 ? 'success' : 'danger' };
    const estiloFila = inicio + i === cursor ? { fg: 'accent' } : null;
    return [
      { text: symbol, style: estiloFila },
      { text: fmtPrecio(ticker?.price), style: estiloFila },
      { text: fmtVariacion(valor), style: estiloValor }
    ];
  });
  const relleno = Math.max(0, maxFilas - filas.length);
  const contenido = [text('watchlist', { fg: 'accent', bold: true })];

  if (conSeparacion) contenido.push(gap(1));
  contenido.push(table({ headers: ['simbolo', 'ultimo', '24h'], rows: filas, fill: true }));
  if (error) contenido.push(text('err: ' + error, { fg: 'danger' }));
  if (conSeparacion) contenido.push(gap(1 + relleno));
  else if (relleno > 0) contenido.push(gap(relleno));
  contenido.push(...ayudas.map(linea => text(linea, { fg: 'muted' })));

  return box(rows(contenido), marco);
}
