// los constructores de arboles que view pinta - crean los distintos widgets

// un parrafo de texto con estilo (obj o string ANSI)
export function text(content, style = '') {
  return { type: 'text', content: String(content), style };
}

// espacio vertical de n lineas vacias
export function gap(lines = 1) {
  return { type: 'gap', h: lines };
}

// apila hijos en vertical; cada hijo es una linea o un arbol
export function rows(children) {
  return { type: 'rows', children: Array.isArray(children) ? children : [children] };
}

// columnas lado a lado - widths[i] fija ancho o se deja al contenido
export function cols(children, opts = {}) {
  return { type: 'cols', children: Array.isArray(children) ? children : [children], widths: opts.widths || null, gap: opts.gap ?? 1 };
}

// bandas: 'h' (columnas), 'v' filas - sizes[i] fijo o null reparte - gap separa
export function split(opts) {
  return {
    type: 'split',
    dir: opts.dir || 'h',
    children: Array.isArray(opts.children) ? opts.children : [opts.children],
    sizes: opts.sizes || null,
    gap: opts.gap ?? 1,
  };
}

// caja con borde, padding y alineacion interior (h/w opcionales)
export function box(child, opts = {}) {
  return { type: 'box', child, ...opts };
}

// tabla simple: cabeceras, filas y una fila seleccionada (cursor)
export function table(opts) {
  return { type: 'table', headers: opts.headers || [], rows: opts.rows || [], cursor: opts.cursor ?? null };
}

// barra de progreso con etiqueta y valor opcionales
export function bar(opts) {
  return { type: 'bar', label: String(opts.label ?? ''), value: String(opts.value ?? ''), percent: opts.percent ?? 0, width: opts.width ?? null };
}