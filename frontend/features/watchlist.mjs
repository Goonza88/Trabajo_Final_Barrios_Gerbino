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

// ancho minimo para que ninguna linea se corte ni haga wrap
export function anchoWatchlist(ayuda = []) {
  return Math.max(30, ...ayuda.map(linea => textWidth(linea) + 4));
}

// la watchlist es el ticker - al final muestra las lineas de ayuda que le pasa la vista
export function vistaWatchlist(estado, { width, height, ayuda }) {
  const marco = {
    border: 'round',
    pad: [0, 1],
    height,
    borderStyle: estado.foco === 'watchlist' ? { fg: 'accent' } : null
  };
  const { innerH } = boxSize(marco, width);
  const { simbolos, tickers, cursor } = estado;
  const ayudasCompactas = ayuda.filter(linea => linea !== '');
  const error = estado.tickers_error ? sanitize(estado.tickers_error) : null;
  const alto = innerH;
  const extraError = error ? 1 : 0;
  const cabeCompleta = alto >= 4 + 1 + ayuda.length + extraError;
  const cabeCompacta = alto >= 4 + 1 + ayudasCompactas.length + extraError;
  const conSeparacion = cabeCompleta || cabeCompacta;
  const ayudas = cabeCompleta ? ayuda : ayudasCompactas;
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
