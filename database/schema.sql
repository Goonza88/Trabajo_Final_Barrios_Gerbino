-- esquema de la base SQLite del sistema
-- se crea una sola vez con las migraciones de backend/datos
-- los datos se guardan en un unico archivo: data/app.db

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- catalogo ----------------------------------------------------------------------------------------

CREATE TABLE exchange (
  id                 TEXT    PRIMARY KEY,
  nombre             TEXT    NOT NULL,
  base_url           TEXT    NOT NULL,
  ws_url             TEXT    NOT NULL,
  peso_por_consulta  INTEGER NOT NULL CHECK (peso_por_consulta > 0),
  limite_por_minuto  INTEGER NOT NULL CHECK (limite_por_minuto > 0)
);

-- la clave es compuesta: el mismo symbol puede existir en distintos exchanges
CREATE TABLE simbolo (
  exchange_id  TEXT NOT NULL REFERENCES exchange(id) ON DELETE RESTRICT,
  symbol       TEXT NOT NULL,
  base         TEXT NOT NULL,
  quote        TEXT NOT NULL,
  PRIMARY KEY (exchange_id, symbol)
);

CREATE TABLE simbolo_intervalo (
  exchange_id  TEXT NOT NULL,
  symbol       TEXT NOT NULL,
  interval     TEXT NOT NULL CHECK (interval IN ('1m','5m','1h','4h','1d')),
  PRIMARY KEY (exchange_id, symbol, interval),
  FOREIGN KEY (exchange_id, symbol)
    REFERENCES simbolo(exchange_id, symbol) ON DELETE CASCADE
);

-- mercado ----------------------------------------------------------------------------------------

CREATE TABLE kline (
  exchange_id  TEXT    NOT NULL,
  symbol       TEXT    NOT NULL,
  interval     TEXT    NOT NULL,
  open_time    INTEGER NOT NULL,
  open         TEXT    NOT NULL,
  high         TEXT    NOT NULL,
  low          TEXT    NOT NULL,
  close        TEXT    NOT NULL,
  volume       TEXT    NOT NULL,
  close_time   INTEGER NOT NULL,
  quote_volume TEXT    NOT NULL,
  trades       INTEGER,
  ingested_at  INTEGER NOT NULL,
  PRIMARY KEY (exchange_id, symbol, interval, open_time),
  FOREIGN KEY (exchange_id, symbol, interval)
    REFERENCES simbolo_intervalo(exchange_id, symbol, interval) ON DELETE CASCADE
);

CREATE TABLE ticker (
  exchange_id      TEXT    NOT NULL,
  symbol           TEXT    NOT NULL,
  timestamp        INTEGER NOT NULL,
  price            TEXT    NOT NULL,
  open_24h         TEXT,
  high_24h         TEXT,
  low_24h          TEXT,
  volume_24h       TEXT,
  quote_volume_24h TEXT,
  PRIMARY KEY (exchange_id, symbol, timestamp),
  FOREIGN KEY (exchange_id, symbol)
    REFERENCES simbolo(exchange_id, symbol) ON DELETE CASCADE
);

-- usuario ----------------------------------------------------------------------------------------

CREATE TABLE watchlist (
  id         INTEGER PRIMARY KEY,
  nombre     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE watchlist_item (
  watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
  exchange_id  TEXT    NOT NULL,
  symbol       TEXT    NOT NULL,
  added_at     INTEGER NOT NULL,
  note         TEXT,
  PRIMARY KEY (watchlist_id, exchange_id, symbol),
  FOREIGN KEY (exchange_id, symbol)
    REFERENCES simbolo(exchange_id, symbol) ON DELETE CASCADE
);

CREATE TABLE alerta (
  id             INTEGER PRIMARY KEY,
  exchange_id    TEXT    NOT NULL,
  symbol         TEXT    NOT NULL,
  tipo           TEXT    NOT NULL CHECK (tipo IN ('precio','variacion','volumen','indicador')),
  campo          TEXT    NOT NULL,
  operador       TEXT    NOT NULL CHECK (operador IN ('>','>=','<','<=','==','cruza_arriba','cruza_abajo')),
  valor          REAL    NOT NULL,
  timeframe      TEXT    NOT NULL,
  activa         INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0,1)),
  disparada      INTEGER NOT NULL DEFAULT 0 CHECK (disparada IN (0,1)),
  ultimo_disparo INTEGER,
  disparos       INTEGER NOT NULL DEFAULT 0 CHECK (disparos >= 0),
  note           TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  FOREIGN KEY (exchange_id, symbol)
    REFERENCES simbolo(exchange_id, symbol) ON DELETE CASCADE
);

CREATE TABLE operacion (
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
  FOREIGN KEY (exchange_id, symbol)
    REFERENCES simbolo(exchange_id, symbol) ON DELETE RESTRICT
);

CREATE TABLE operacion_tag (
  operacion_id INTEGER NOT NULL REFERENCES operacion(id) ON DELETE CASCADE,
  tag          TEXT    NOT NULL,
  PRIMARY KEY (operacion_id, tag)
);

CREATE TABLE nota (
  id          INTEGER PRIMARY KEY,
  exchange_id TEXT,
  symbol      TEXT,
  titulo      TEXT NOT NULL,
  cuerpo      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  CHECK ((exchange_id IS NULL) = (symbol IS NULL)),
  FOREIGN KEY (exchange_id, symbol)
    REFERENCES simbolo(exchange_id, symbol) ON DELETE SET NULL
);

CREATE TABLE nota_tag (
  nota_id INTEGER NOT NULL REFERENCES nota(id) ON DELETE CASCADE,
  tag     TEXT    NOT NULL,
  PRIMARY KEY (nota_id, tag)
);

CREATE TABLE config (
  id                    TEXT PRIMARY KEY CHECK (id = 'local'),
  intervalo_por_defecto TEXT NOT NULL,
  exchange_id           TEXT,
  simbolo_por_defecto   TEXT,
  fuente                TEXT NOT NULL CHECK (fuente IN ('local','remoto')),
  fuente_url            TEXT,
  sondeo_ms             INTEGER NOT NULL CHECK (sondeo_ms > 0),
  actualizado_en        INTEGER NOT NULL,
  CHECK ((exchange_id IS NULL) = (simbolo_por_defecto IS NULL)),
  FOREIGN KEY (exchange_id, simbolo_por_defecto)
    REFERENCES simbolo(exchange_id, symbol) ON DELETE SET NULL
);

-- indices ----------------------------------------------------------------------------------------

CREATE INDEX idx_alerta_activa    ON alerta(exchange_id, symbol, activa);
CREATE INDEX idx_operacion_estado ON operacion(exchange_id, symbol, estado);
CREATE INDEX idx_operacion_fecha  ON operacion(abierta_en);
CREATE INDEX idx_nota_symbol      ON nota(exchange_id, symbol);