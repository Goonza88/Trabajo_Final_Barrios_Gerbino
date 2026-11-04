// pantalla de carga - logo, titulo y mensaje

import { box, gap, rows, text } from '../../backend/terminal/widgets.mjs';
import { graficoLogo, graficoTitulo } from '../graficos/logo.mjs';

export function vistaCarga({ cols, rows: alto, mensaje = 'cargando' }) {
  const logo = graficoLogo({ alto: Math.max(4, Math.floor(alto / 3)) });
  return box(rows([
    logo,
    gap(2),
    graficoTitulo({ ancho: logo.width }),
    gap(1),
    text(mensaje, { fg: 'sec' }),
  ]), { width: cols, height: alto, align: 'center', valign: 'middle' });
}
