# Contrato de datos

Este documento es el acuerdo entre la capa de dominio y la capa de persistencia (`backend/datos`). Define los metodos que existen, lo que reciben y devuelven, y los errores que tiran.

Este documento y [`schema.sql`](schema.sql) son la unica especificacion; `backend/datos/sqlite/` debe implementarla sin tocar `backend/terminal/` ni `frontend/`.

`backend/datos/contrato/` contiene los vocabularios, el catalogo inicial y las validaciones con los mensajes de error de este documento.

## Como se integra una implementacion

Toda implementacion expone una unica funcion:

```js
// backend/datos/<nombre>/index.mjs
export function createData(options = {}) {
  // ...
  return { catalog, market, config, watchlist, alerts, operations, notes, close };
}
```

- `createData()` devuelve una base de datos nueva, con el catalogo inicial cargado; no comparte estado con otras llamadas
- `options.ahora` es un reloj que devuelve milisegundos; si no viene, los repositorios usan `Date.now` para los instantes de auditoria
- El objeto devuelto tiene siete repositorios (`catalog`, `market`, `config`, `watchlist`, `alerts`, `operations`, `notes`) y una funcion `close()`
- Todos los metodos son sincronicos; `close()` libera los recursos de la implementacion y, en sqlite, cierra la base de datos

## Definicion de terminado

1. `backend/datos/sqlite/index.mjs` implementa `createData(options)`
2. Abre conexion, aplica los `PRAGMA`, corre las migraciones y devuelve los siete repositorios + `close()`
3. Cada metodo cumple lo que dice este documento, la sintaxis esta limpia y el CI pasa todo en verde
4. No se toco nada de `backend/terminal/` ni de `frontend/`

## Reglas generales

Aplican a todos los metodos:

1. **Que existe y que no:** Una lectura sobre un padre inexistente devuelve vacio, no tira error; una escritura o un borrado tira
2. **Argumentos:** Un argumento requerido que esta ausente o con formato invalido tira error siempre, incluso en lectura
3. **Campos desconocidos:** Los objetos se validan campo por campo, una clave que el metodo no conoce tira error `campo desconocido: <clave>` y los campos de estado no son editables
4. **Copias:** Mutar lo que devuelve un repositorio no afecta a la persistencia
5. **Sin cuentas:** La matematica decimal es del dominio, en `metricas/`, por eso `closeOperation` reemplaza `fees` con el total que le pasa el dominio en vez de sumarlo
6. **Idempotencia:** `registerExchange` y `registerSymbol` tiran si el registro ya existe; `saveCandles` y `saveTicker` hacen `upsert` (volver a guardar el mismo periodo reemplaza la fila); `enableInterval` tambien es idempotente

### Booleanos

Se guardan y devuelven como `0` o `1`, nunca `true`/`false`; otro valor tira `booleano invalido en <campo>: <valor>`.

### Decimales

Son `TEXT` con formato simple: `\d+` o `\d+\.\d{1,8}`.

- Sin signo
- Sin notacion cientifica
- Sin coma decimal

Un valor invalido tira `decimal invalido en <campo>: <valor>`.

### Instantes

Son `INTEGER` en milisegundos desde epoch UTC.

- Los de auditoria (`created_at`, `updated_at`, `added_at`, `abierta_en`, `cerrada_en`, `actualizado_en`, `ultimo_disparo`) los genera el repositorio con `options.ahora()`
- Los de contenido (`open_time`, `close_time`, `ingested_at`, `timestamp`) vienen con el dato

Un instante invalido tira `entero invalido en <campo>: <valor>`.

## Catalogo inicial

`createData()` arranca con el catalogo de `INITIAL_CATALOG` (`types.mjs`) cargado:

- Exchange `binance` con los valores de [`docs/exchanges.md`](../docs/exchanges.md)
- Simbolos `BTCUSDT` y `ETHUSDT`, con los cinco intervalos de `INTERVALS` habilitados

Las migraciones de `backend/datos/migraciones/` cargan lo mismo e importan `INITIAL_CATALOG`.

## Metodos

Salvo indicacion contraria, los nombres de los campos son los de las columnas de [`schema.sql`](schema.sql).

### catalog

| Metodo | Recibe | Devuelve |
| --- | --- | --- |
| `listExchanges()` | — | `exchange[]` |
| `getExchange(id)` | `id` | `exchange` o `null` |
| `registerExchange(exchange)` | objeto `exchange` | la fila creada |
| `registerSymbol(simbolo)` | `{ exchange_id, symbol, base, quote }` | la fila creada |
| `listSymbols(filtro)` | `{ exchange? }` | `simbolo[]` |
| `enableInterval(exchange_id, symbol, interval)` | tres textos | — |
| `listIntervals(exchange_id, symbol)` | dos textos | `string[]` |

- `registerExchange`: `peso_por_consulta` y `limite_por_minuto` son enteros positivos; el `id` no se repite
- `registerSymbol`: el exchange debe existir; el par `exchange_id`/`symbol` no se repite
- `enableInterval`: el intervalo sale de `INTERVALS`; es idempotente
- `listIntervals`: orden de `INTERVALS`

### market

| Metodo | Recibe | Devuelve |
| --- | --- | --- |
| `saveCandles(velas)` | `vela[]` | cantidad de velas |
| `readCandles(filtro)` | `{ exchange_id, symbol, interval, desde?, hasta?, limite? }` | `kline[]` |
| `saveTicker(ticker)` | objeto `ticker` | la fila guardada |
| `readLastTicker(exchange_id, symbol)` | dos textos | `ticker` o `null` |

- `saveCandles`: `upsert` por `(exchange_id, symbol, interval, open_time)`; el intervalo debe estar habilitado; devuelve la cantidad recibida
- `readCandles`: `desde` inclusivo, `hasta` exclusivo; orden por `open_time`; con `limite`, las N mas recientes
- `saveTicker`: `upsert` por `(exchange_id, symbol, timestamp)`; los `*_24h` opcionales quedan en `null`
- `readLastTicker`: la fila de `timestamp` mayor

### config

| Metodo | Recibe | Devuelve |
| --- | --- | --- |
| `readConfig()` | — | `config` o `null` |
| `saveConfig(config)` | objeto `config` (sin `id`) | la fila guardada |

- Una fila con `id = 'local'`; `readConfig` es `null` hasta el primer `saveConfig`, que reemplaza la fila y pone `actualizado_en` con el reloj
- `intervalo_por_defecto` sale de `INTERVALS`; `fuente` de `CONFIG_SOURCES`; `sondeo_ms` es entero positivo
- `exchange_id` y `simbolo_por_defecto` van juntos; el simbolo debe tener habilitado `intervalo_por_defecto`
- `fuente: 'remoto'` exige `fuente_url`; `'local'` no la admite; el campo que no corresponde queda en `null`

### watchlist

| Metodo | Recibe | Devuelve |
| --- | --- | --- |
| `listWatchlists()` | — | `watchlist[]` |
| `createWatchlist(nombre)` | texto | la fila creada |
| `renameWatchlist(id, nombre)` | entero y texto | la fila actualizada |
| `deleteWatchlist(id)` | entero | — |
| `listItems(watchlist_id)` | entero | `watchlist_item[]` |
| `addItem(watchlist_id, item)` | entero y `{ exchange_id, symbol, note? }` | la fila creada |
| `removeItem(watchlist_id, exchange_id, symbol)` | entero y dos textos | — |
| `editItem(watchlist_id, exchange_id, symbol, cambios)` | entero, dos textos y `{ note }` | la fila actualizada |

- `createWatchlist`: `nombre` no vacio; `created_at` y `updated_at` salen del reloj y son iguales al crear
- `renameWatchlist` actualiza `updated_at`; `deleteWatchlist` arrastra los items (`ON DELETE CASCADE`)
- `addItem`: el par no se repite; `added_at` sale del reloj; `note` es opcional
- `removeItem` y `editItem`: el par debe existir; `editItem` solo cambia `note` (con `null` se borra)

### alerts

| Metodo | Recibe | Devuelve |
| --- | --- | --- |
| `createAlert(alerta)` | ver abajo | la fila creada |
| `listAlerts(filtro)` | `{ exchange_id?, symbol?, activas? }` | `alerta[]` |
| `updateAlert(id, cambios)` | entero y campos editables | la fila actualizada |
| `deleteAlert(id)` | entero | — |
| `markTriggered(id)` | entero | la fila actualizada |

- `createAlert`: `{ exchange_id, symbol, tipo, campo, operador, valor, timeframe, activa?, note? }`; `activa` arranca en `1`; `disparada`, `disparos`, `ultimo_disparo` y los timestamps los pone el repositorio
- `tipo` sale de `ALERT_TYPES`; `campo` sigue el `CHECK`: `precio`/`price`, `variacion`/`change24h`, `volumen`/`volume24h`; en `indicador` es el nombre del indicador
- `operador` sale de `ALERT_OPERATORS`; `valor` es decimal; `timeframe` sale de `INTERVALS`; `activa` es `0` o `1`; el simbolo debe existir
- `updateAlert`: arma la alerta con lo que habia y la valida entera; los campos de estado no son editables; actualiza `updated_at`
- `listAlerts`: filtra por `exchange_id`, `symbol` y `activas` (omitido, todas); orden por `id`
- `markTriggered`: `disparada = 1`, `disparos` mas uno, `ultimo_disparo` y `updated_at`

### operations

| Metodo | Recibe | Devuelve |
| --- | --- | --- |
| `registerOperation(operacion)` | ver abajo | la fila creada, con `tags` |
| `listOperations(filtro)` | `{ exchange_id?, symbol?, estado? }` | `operacion[]`, con `tags` |
| `getOperation(id)` | entero | la fila con `tags`, o `null` |
| `closeOperation(id, cierre)` | entero y `{ precio_salida, fees? }` | la fila actualizada, con `tags` |
| `cancelOperation(id)` | entero | la fila actualizada, con `tags` |
| `addTag(operacion_id, tag)` | entero y texto | `string[]` de tags |
| `removeTag(operacion_id, tag)` | entero y texto | `string[]` de tags |

- `registerOperation`: `{ exchange_id, symbol, lado, tipo, cantidad, precio_entrada, fees?, notas?, tags? }`; arranca en `abierta`, con `precio_salida` y `cerrada_en` en `null`, `fees = '0'` si no viene y `abierta_en` del reloj; `fees` es el total acumulado
- `lado` sale de `OPERATION_SIDES`; `tipo` de `ORDER_TYPES`; las `tags` no se repiten ni son vacias
- `closeOperation` y `cancelOperation`: solo sobre `abierta`; la primera deja `estado = 'cerrada'` y guarda `precio_salida`, `cerrada_en` y, si viene, `fees`; la segunda deja `estado = 'cancelada'`, `cerrada_en` y `precio_salida = null`
- `addTag` y `removeTag`: la tag no se repite ni falta; devuelven la lista
- `listOperations` ordena por `id`

### notes

| Metodo | Recibe | Devuelve |
| --- | --- | --- |
| `createNote(nota)` | ver abajo | la fila creada, con `tags` |
| `listNotes(filtro)` | `{ exchange_id?, symbol?, busqueda? }` | `nota[]`, con `tags` |
| `editNote(id, cambios)` | entero y campos editables | la fila actualizada, con `tags` |
| `deleteNote(id)` | entero | — |
| `addTag(nota_id, tag)` | entero y texto | `string[]` de tags |
| `removeTag(nota_id, tag)` | entero y texto | `string[]` de tags |

- `createNote`: `{ exchange_id?, symbol?, titulo, cuerpo, tags? }`; `exchange_id` y `symbol` van juntos o ninguno; `titulo` y `cuerpo` no son vacios; timestamps del reloj
- `editNote`: cambia `titulo`, `cuerpo` y la pareja (`null` en ambos para separar); `created_at`, `id` y `tags` no se editan; actualiza `updated_at`
- `listNotes`: `busqueda` es substring sin distinguir mayusculas sobre `titulo` y `cuerpo`; orden por `id`
- `addTag` y `removeTag`: igual que en operaciones

## Errores

Todos son `Error` con mensaje en castellano sin acentos; el texto es parte del contrato.

| Patron | Cuando |
| --- | --- |
| `decimal invalido en <campo>: <valor>` | un decimal no tiene el formato simple |
| `entero invalido en <campo>: <valor>` | un entero o instante no es entero seguro (o es menor al minimo) |
| `booleano invalido en <campo>: <valor>` | un booleano no es `0` ni `1` |
| `<campo> invalido: <valor> (se espera uno de ...)` | un valor fuera de un vocabulario |
| `texto invalido en <campo>: <valor>` | un texto obligatorio vacio o de otro tipo |
| `parametro requerido: <campo>` | falta un argumento requerido |
| `campo desconocido: <clave>` | clave no reconocida, o campo no editable |
| `se espera una lista de velas` | `saveCandles` no recibio un array |
| `exchange ya registrado: <id>` / `simbolo ya registrado: <e>/<s>` | escritura de catalogo duplicada |
| `exchange inexistente: <id>` / `simbolo inexistente: <e>/<s>` | escritura sobre un simbolo o exchange desconocido |
| `intervalo no habilitado: <e>/<s>/<i>` | vela de un intervalo que no esta habilitado |
| `el intervalo <i> no esta habilitado para <e>/<s>` | la config apunta a un intervalo sin habilitar |
| `<exchange_id> y <campo> van juntos` | pareja de campos incompleta (`config`, `notes`) |
| `fuente remoto necesita fuente_url` / `fuente_url solo va en remoto` | la url y la fuente no concuerdan |
| `campo <x> no corresponde al tipo <tipo> (se espera <y>)` | pareja `tipo`/`campo` de alerta rota |
| `el simbolo ya esta en la watchlist: <e>/<s>` / `el simbolo no esta en la watchlist: <e>/<s>` | el item de watchlist ya esta o no esta |
| `watchlist inexistente: <id>` / `alerta inexistente: <id>` / `operacion inexistente: <id>` / `nota inexistente: <id>` | escritura sobre un id desconocido |
| `la operacion no esta abierta: <estado>` | cerrar o cancelar algo que no esta abierto |
| `la tag ya esta: <t>` / `la tag no existe: <t>` | tag duplicada o ausente |
| `tag repetida: <t>` | tags repetidas dentro de la misma alta |