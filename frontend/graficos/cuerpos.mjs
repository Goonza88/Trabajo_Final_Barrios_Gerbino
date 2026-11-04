// cuerpos y mechas de las velas por mitades de fila

import { estiloVela } from './trazos.mjs';

// velas por mitades de fila
const TRAZOS = {
  'mecha,': '╵',
  ',mecha': '╷',
  'mecha,mecha': '│',
  'cuerpo,': '╹',
  ',cuerpo': '╻',
  'cuerpo,cuerpo': '┃',
  'mecha,cuerpo': '╽',
  'cuerpo,mecha': '╿',
};

// cuerpo sin alto (doji o casi) en el medio de la fila - raya gruesa cruzada por la mecha
const MARCAS = {
  'mecha,mecha': '┿',
  'mecha,': '┷',
  ',mecha': '┯',
  ',': '━',
};

// dibuja cada vela en su columna del plot - py lleva un precio a su fila
export function dibujarVelas(plot, velas, colForIndex, py) {
  const plotH = plot.length;
  const plotW = plot[0]?.length ?? 0;

  // limite de media fila mas cercano a posicion - mitad s va a s + 1 y fila r a 2r o 2r + 1
  const limiteMitad = (p) => Math.round((p + 0.5) * 2);

  // dos formas de dibujar el cuerpo segun donde caen los limites
  function estadosCuerpo(pO, pC) {
    if (!Number.isFinite(pO) || !Number.isFinite(pC)) {
      return [{ inicio: NaN, fin: NaN, open: NaN, close: NaN, local: 0 }];
    }
    const alcista = pC <= pO;
    const yTop = (Math.min(pO, pC) + 0.5) * 2;
    const yBottom = (Math.max(pO, pC) + 0.5) * 2;
    const estado = (inicio, fin) => ({
      inicio,
      fin,
      open: alcista ? fin : inicio,
      close: alcista ? inicio : fin,
      local: (inicio - yTop) ** 2 + (fin - yBottom) ** 2,
    });
    const inicio = limiteMitad(Math.min(pO, pC));
    const fin = limiteMitad(Math.max(pO, pC));
    if (fin > inicio || inicio % 2 === 1) return [estado(inicio, fin)];
    // en un doji apertura y cierre son el mismo limite, en cualquiera de las dos formas
    if (pO === pC) {
      return [inicio - 1, inicio].map(desde => ({ ...estado(desde, desde + 1), open: inicio, close: inicio }));
    }
    return [estado(inicio - 1, inicio), estado(inicio, inicio + 1)];
  }

  function mismoPrecio(a, b) {
    const x = Number(a), y = Number(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return Math.abs(x - y) <= Math.max(1e-9, Math.max(Math.abs(x), Math.abs(y)) * 1e-9);
  }

  // elige la variante que mejor coincide con cierre/apertura de velas vecinas
  function elegirCuerpos(cuerpos) {
    const n = cuerpos.length;
    if (!n) return [];
    const PESO_LOCAL = 1e-6;
    const PESO_EMPALME = 4;
    const dp = Array.from({ length: n }, () => []);
    const desde = Array.from({ length: n }, () => []);
    for (let s = 0; s < cuerpos[0].estados.length; s++) {
      dp[0][s] = cuerpos[0].estados[s].local * PESO_LOCAL;
    }
    for (let i = 1; i < n; i++) {
      const estados = cuerpos[i].estados;
      const anteriores = cuerpos[i - 1].estados;
      const comparte = mismoPrecio(velas[i - 1]?.close, velas[i]?.open);
      for (let s = 0; s < estados.length; s++) {
        let mejor = Infinity;
        let mejorPrev = 0;
        for (let p = 0; p < anteriores.length; p++) {
          const base = dp[i - 1][p];
          if (!Number.isFinite(base)) continue;
          const a = anteriores[p];
          const b = estados[s];
          const empalme = comparte && Number.isFinite(a.close) && Number.isFinite(b.open)
            ? (a.close - b.open) ** 2 * PESO_EMPALME
            : 0;
          const costo = base + empalme;
          if (costo < mejor) {
            mejor = costo;
            mejorPrev = p;
          }
        }
        dp[i][s] = mejor + estados[s].local * PESO_LOCAL;
        desde[i][s] = mejorPrev;
      }
    }
    let elegido = 0;
    for (let s = 1; s < dp[n - 1].length; s++) {
      if (dp[n - 1][s] < dp[n - 1][elegido]) elegido = s;
    }
    const eleccion = Array(n);
    eleccion[n - 1] = elegido;
    for (let i = n - 1; i > 0; i--) eleccion[i - 1] = desde[i][eleccion[i]];
    return eleccion;
  }

  const cuerpos = velas.map((c, i) => {
    const o = Number(c.open), cl = Number(c.close);
    const col = colForIndex(i);
    const style = estiloVela(c);
    if (col < 0 || col >= plotW) {
      return { col, style, estados: [{ inicio: NaN, fin: NaN, open: NaN, close: NaN, local: 0 }] };
    }
    return { col, style, estados: estadosCuerpo(py(o), py(cl)) };
  });
  const eleccion = elegirCuerpos(cuerpos);

  for (let i = 0; i < velas.length; i++) {
    const { col, style } = cuerpos[i];
    if (col < 0 || col >= plotW) continue;
    const estado = cuerpos[i].estados[eleccion[i]];
    const conCuerpo = Number.isFinite(estado.inicio);
    // la mecha llega al menos hasta el cuerpo, para que siempre se toquen
    const desde = Math.min(limiteMitad(py(Number(velas[i].high))), conCuerpo ? estado.inicio : Infinity);
    const hasta = Math.max(limiteMitad(py(Number(velas[i].low))), conCuerpo ? estado.fin : -Infinity);
    // fila de la raya cuando el cuerpo no tiene alto
    const marca = conCuerpo && estado.inicio === estado.fin ? (estado.inicio - 1) / 2 : null;
    const mitad = (s) => {
      if (s < desde || s >= hasta) return '';
      return conCuerpo && s >= estado.inicio && s < estado.fin ? 'cuerpo' : 'mecha';
    };
    const primera = Math.max(0, Math.floor(desde / 2));
    const ultima = Math.min(plotH - 1, Math.floor((hasta - 1) / 2));
    for (let row = primera; row <= ultima; row++) {
      const clave = mitad(2 * row) + ',' + mitad(2 * row + 1);
      const ch = row === marca ? MARCAS[clave] : TRAZOS[clave];
      if (ch) plot[row][col] = { ch, style };
    }
  }
}
