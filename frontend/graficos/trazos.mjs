// piezas compartidas por los graficos - columnas, ejes, celdas y lineas escalonadas

// columnas del eje de precios a la izquierda del grafico
export function anchoEje(totalW, showAxis) {
  return showAxis ? Math.min(9, Math.max(0, totalW - 1)) : 0;
}

export function anchoPlot(width, showAxis = true) {
  const totalW = Math.max(1, Math.floor(width));
  return Math.max(1, totalW - anchoEje(totalW, showAxis));
}

// verde si la vela cerro arriba o igual a su apertura, roja si cerro abajo
export function estiloVela(vela) {
  return { fg: Number(vela.close) >= Number(vela.open) ? 'success' : 'danger' };
}

export function limitarVelas(velas, capacidad) {
  const max = Math.max(1, Math.floor(capacidad));
  return velas.length > max ? velas.slice(-max) : velas;
}

// escribe texto en una fila de celdas, un caracter por columna
export function putText(cells, row, col, text, style) {
  const line = cells[row];
  if (!line) return;
  let c = col;
  for (const ch of String(text)) {
    if (c >= line.length) break;
    if (c >= 0) line[c] = style ? { ch, style } : { ch };
    c++;
  }
}

export function celdaLinea(plot, row, col, ch, style) {
  if (plot[row] && col >= 0 && col < plot[row].length) {
    plot[row][col] = { ch, style };
  }
}

// linea escalonada - estilo(i) pinta el tramo del punto i hasta el siguiente
export function dibujarEscalon(plot, valores, colForIndex, filaParaValor, estilo) {
  let anterior = null;
  for (let i = 0; i < valores.length; i++) {
    if (valores[i] == null) {
      anterior = null;
      continue;
    }
    const value = Number(valores[i]);
    if (!Number.isFinite(value)) {
      anterior = null;
      continue;
    }

    const col = colForIndex(i);
    const position = filaParaValor(value);
    if (!Number.isFinite(position)) {
      anterior = null;
      continue;
    }
    const row = Math.max(0, Math.min(plot.length - 1, Math.round(position)));
    const style = estilo(i);
    if (!anterior) {
      celdaLinea(plot, row, col, '─', style);
      anterior = { row, col, style };
      continue;
    }

    // arranca despues del punto anterior para no pisar su esquina
    for (let x = anterior.col + 1; x < col; x++) celdaLinea(plot, anterior.row, x, '─', anterior.style);
    if (row === anterior.row) {
      celdaLinea(plot, row, col, '─', style);
    } else {
      const arriba = Math.min(row, anterior.row);
      const abajo = Math.max(row, anterior.row);
      for (let y = arriba + 1; y < abajo; y++) celdaLinea(plot, y, col, '│', style);
      const baja = row > anterior.row;
      celdaLinea(plot, anterior.row, col, baja ? '╮' : '╯', style);
      celdaLinea(plot, row, col, baja ? '╰' : '╭', style);
    }
    anterior = { row, col, style };
  }
}

// columna de la vela i - las velas se reparten en todo el ancho del grafico
export function columnaVela(i, cantidad, plotW) {
  if (cantidad <= 1) return Math.floor(plotW / 2);
  return Math.round((i / Math.max(1, cantidad - 1)) * (plotW - 1));
}

// vela mas cercana a una columna del area de velas, la inversa de columnaVela
export function indiceEnColumna(col, cantidad, plotW) {
  if (cantidad <= 1) return 0;
  const estimado = Math.round((col / Math.max(1, plotW - 1)) * (cantidad - 1));
  const candidatos = [estimado - 1, estimado, estimado + 1].filter(i => i >= 0 && i < cantidad);
  if (!candidatos.length) return col < 0 ? 0 : cantidad - 1;
  return candidatos.reduce((mejor, i) =>
    Math.abs(columnaVela(i, cantidad, plotW) - col) < Math.abs(columnaVela(mejor, cantidad, plotW) - col) ? i : mejor);
}
