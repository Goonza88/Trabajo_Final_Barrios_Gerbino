import { box, gap, rows, table, text } from '../../backend/terminal/widgets.mjs';
import { boxSize } from '../../backend/terminal/layout.mjs';
import { sanitize, textWidth } from '../../backend/terminal/ansi.mjs';

const TECLAS_INTERVALO = ['a', 's', 'd', 'f', 'g'];
const INTERVALOS_DEFECTO = ['1m', '5m', '1h', '4h', '1d'];

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

export function indiceTickers(tickers) {
  if (Array.isArray(tickers)) {
    const indice = {};
    for (const ticker of tickers) {
      if (ticker?.symbol) indice[ticker.symbol] = ticker;
    }
    return indice;
  }
  return tickers || {};
}

// una linea por keybind, con una linea vacia entre secciones
// los intervalos usan el tiempo configurado en el estado
export function lineasAyuda(intervalos = INTERVALOS_DEFECTO) {
  const lista = Array.isArray(intervalos) && intervalos.length ? intervalos : INTERVALOS_DEFECTO;
  const secciones = [
    ['Enter - Seleccionar', 'Tab - Cambiar Foco'],
    ['h - Izquierda', 'j - Abajo', 'k - Arriba', 'l - Derecha'],
    ['y - Alejar Horizontal', 'u - Alejar Vertical', 'i - Acercar Vertical', 'o - Acercar Horizontal'],
    ['t - Vista de Tabla', 'p - Vista de Precision'],
    lista.map((intervalo, i) => (TECLAS_INTERVALO[i] ?? '?') + ' - Intervalo ' + intervalo),
    ['q - Volver']
  ];
  return secciones.flatMap((seccion, i) => i === 0 ? seccion : ['', ...seccion]);
}

// ancho minimo para que ninguna ayuda se corte ni haga wrap
export function anchoWatchlist(estado = {}) {
  const ancho = Math.max(...lineasAyuda(estado.intervalos).map(linea => textWidth(linea)));
  return Math.max(30, ancho + 4);
}

export function vistaWatchlist(estado, { width = 26, height = 10 } = {}) {
  const marco = {
    border: 'round',
    pad: [0, 1],
    height,
    borderStyle: estado.foco === 'watchlist' ? { fg: 'accent' } : null
  };
  const { innerH } = boxSize(marco, width);
  const simbolos = Array.isArray(estado.simbolos) && estado.simbolos.length
    ? estado.simbolos
    : [estado.symbol].filter(Boolean);
  const tickers = indiceTickers(estado.tickers);
  const cursor = Math.max(0, Math.min(estado.cursor ?? 0, Math.max(0, simbolos.length - 1)));
  const ayudasCompletas = lineasAyuda(estado.intervalos);
  const ayudasCompactas = ayudasCompletas.filter(linea => linea !== '');
  const error = estado.tickers_error ? sanitize(estado.tickers_error) : null;
  const alto = innerH ?? height;
  const extraError = error ? 1 : 0;
  const cabeCompleta = alto >= 4 + 1 + ayudasCompletas.length + extraError;
  const cabeCompacta = alto >= 4 + 1 + ayudasCompactas.length + extraError;
  const conSeparacion = cabeCompleta || cabeCompacta;
  const ayudas = cabeCompleta ? ayudasCompletas : ayudasCompactas;
  const overhead = conSeparacion ? 4 : 2;
  const maxFilas = Math.max(0, alto - overhead - ayudas.length - extraError);
  const maxInicio = Math.max(0, simbolos.length - maxFilas);
  const inicio = maxFilas > 0 ? Math.max(0, Math.min(cursor - maxFilas + 1, maxInicio)) : 0;
  const visibles = maxFilas > 0 ? simbolos.slice(inicio, inicio + maxFilas) : [];
  const filas = visibles.map((symbol, i) => {
    const ticker = tickers[symbol];
    const valor = estado.variaciones[symbol] ?? null;
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
