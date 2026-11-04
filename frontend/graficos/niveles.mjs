// lineas horizontales de niveles de precio - entrada, take profit, stop loss y alertas

// linea punteada en las celdas libres y su precio para el eje
export function dibujarNiveles(plot, niveles, py) {
  const etiquetas = [];
  for (const { precio, style } of niveles) {
    if (precio == null) continue;
    const row = Math.round(py(Number(precio)));
    if (!Number.isFinite(row) || row < 0 || row >= plot.length) continue;
    for (let col = 0; col < plot[row].length; col++) {
      if (!plot[row][col]) plot[row][col] = { ch: '┄', style };
    }
    etiquetas.push({ row, texto: String(precio), style });
  }
  return etiquetas;
}
