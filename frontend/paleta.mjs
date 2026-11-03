// la paleta visual del proyecto para uso en terminal, roles semanticos basados en uso
// el substrato trae defaults neutros, la app aplica paletas con setPalette antes de run()

export const PALETA = {
  text:      '#F0EFE7', // white  - texto normal
  accent:    '#BCF734', // lime   - color de marca, titulos y foco
  sec:       '#62798B', // blue   - texto secundario, hints y teclas
  danger:    '#FB524C', // red    - errores y datos en rojo
  muted:     '#62798B', // blue   - azul gris para detalles secundarios
  reader:    '#62798B', // blue   - cursor de input y tramo vacio de la barra
  success:   '#538E07', // green  - estados positivos
  selected:  '#000608', // black  - fondo de la fila seleccionada
  successBg: '#0f1a01', // green  - success al 18%, fondo superior para indicadores
  dangerBg:  '#2d0f0e', // red    - danger al 18%, fondo inferior para indicadores
};