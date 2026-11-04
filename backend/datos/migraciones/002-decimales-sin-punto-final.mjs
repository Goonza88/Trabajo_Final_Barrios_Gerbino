// actualiza los checks de decimales sin perder datos existentes
const alertTable = `CREATE TABLE alerta_migrada (
  id             INTEGER PRIMARY KEY,
  exchange_id    TEXT    NOT NULL,
  symbol         TEXT    NOT NULL,
  tipo           TEXT    NOT NULL CHECK (tipo IN ('precio','variacion','volumen','indicador')),
  campo          TEXT    NOT NULL,
  operador       TEXT    NOT NULL CHECK (operador IN ('>','>=','<','<=','==','cruza_arriba','cruza_abajo')),
  valor          TEXT    NOT NULL,
  timeframe      TEXT    NOT NULL CHECK (timeframe IN ('1m','5m','1h','4h','1d')),
  activa         INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  disparada      INTEGER NOT NULL DEFAULT 0 CHECK (disparada IN (0,1)),
  ultimo_disparo INTEGER,
  disparos       INTEGER NOT NULL DEFAULT 0 CHECK (disparos >= 0),
  note           TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  CHECK (
    (tipo = 'precio' AND campo = 'price') OR
    (tipo = 'variacion' AND campo = 'change24h') OR
    (tipo = 'volumen' AND campo = 'volume24h') OR
    (tipo = 'indicador' AND campo <> '')
  ),
  CHECK (
    valor GLOB '[0-9]*' AND valor NOT GLOB '*[^0-9.]*' AND valor NOT GLOB '*.*.*'
    AND (
      instr(valor, '.') = 0
      OR (length(valor) - instr(valor, '.') BETWEEN 1 AND 8)
    )
  ),
  FOREIGN KEY (exchange_id, symbol)
    REFERENCES simbolo(exchange_id, symbol) ON DELETE CASCADE
);`;

const operationTable = `CREATE TABLE operacion_migrada (
  id             INTEGER PRIMARY KEY,
  exchange_id    TEXT    NOT NULL,
  symbol         TEXT    NOT NULL,
  lado           TEXT    NOT NULL CHECK (lado IN ('compra','venta')),
  tipo           TEXT    NOT NULL CHECK (tipo IN ('mercado','limite')),
  cantidad       TEXT    NOT NULL,
  precio_entrada TEXT    NOT NULL,
  precio_salida  TEXT,
  fees           TEXT    NOT NULL DEFAULT '0',
  abierta_en     INTEGER NOT NULL,
  cerrada_en     INTEGER,
  estado         TEXT    NOT NULL CHECK (estado IN ('abierta','cerrada','cancelada')),
  notas          TEXT,
  CHECK (estado <> 'cerrada' OR (precio_salida IS NOT NULL AND cerrada_en IS NOT NULL)),
  CHECK (
    (
      cantidad GLOB '[0-9]*' AND cantidad NOT GLOB '*[^0-9.]*' AND cantidad NOT GLOB '*.*.*'
      AND (instr(cantidad, '.') = 0 OR (length(cantidad) - instr(cantidad, '.') BETWEEN 1 AND 8))
    ) AND (
      precio_entrada GLOB '[0-9]*' AND precio_entrada NOT GLOB '*[^0-9.]*' AND precio_entrada NOT GLOB '*.*.*'
      AND (instr(precio_entrada, '.') = 0 OR (length(precio_entrada) - instr(precio_entrada, '.') BETWEEN 1 AND 8))
    ) AND (
      precio_salida IS NULL OR (
        precio_salida GLOB '[0-9]*' AND precio_salida NOT GLOB '*[^0-9.]*' AND precio_salida NOT GLOB '*.*.*'
        AND (instr(precio_salida, '.') = 0 OR (length(precio_salida) - instr(precio_salida, '.') BETWEEN 1 AND 8))
      )
    ) AND (
      fees GLOB '[0-9]*' AND fees NOT GLOB '*[^0-9.]*' AND fees NOT GLOB '*.*.*'
      AND (instr(fees, '.') = 0 OR (length(fees) - instr(fees, '.') BETWEEN 1 AND 8))
    )
  ),
  FOREIGN KEY (exchange_id, symbol)
    REFERENCES simbolo(exchange_id, symbol) ON DELETE RESTRICT
);`;

export function up(db) {
  db.exec(alertTable);
  db.exec(operationTable);
  db.exec('INSERT INTO alerta_migrada SELECT * FROM alerta');
  db.exec('INSERT INTO operacion_migrada SELECT * FROM operacion');
  db.exec('DROP TABLE alerta');
  db.exec('DROP TABLE operacion');
  db.exec('ALTER TABLE alerta_migrada RENAME TO alerta');
  db.exec('ALTER TABLE operacion_migrada RENAME TO operacion');
  db.exec('CREATE INDEX idx_alerta_activa ON alerta(exchange_id, symbol, activa)');
  db.exec('CREATE INDEX idx_operacion_estado ON operacion(exchange_id, symbol, estado)');
  db.exec('CREATE INDEX idx_operacion_fecha ON operacion(abierta_en)');
}
