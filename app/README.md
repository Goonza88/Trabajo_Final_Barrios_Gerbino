# Fuentes de mercado

Comparamos tres exchanges para elegir de donde obtener datos Spot. Buscamos velas OHLCV, actualizaciones por WebSocket y consultas publicas sin API key. Las respuestas usan formatos distintos, asi que la app tendra que normalizarlas antes de guardarlas.

## Exchanges

### Binance Spot — candidato elegido

La API key no es necesaria para los endpoints publicos. Las velas se consultan en `https://data-api.binance.vision/api/v3/klines`; el WebSocket publico `wss://stream.binance.com:9443/ws/<symbol>@kline_1m` actualiza la vela abierta cada dos segundos. Cada consulta de klines consume peso 2. El limite general publicado es 6.000 de peso por minuto y puede consultarse en `exchangeInfo`. Con dos simbolos cada cinco segundos usamos aproximadamente 48 de peso por minuto. [REST y limites](https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#klinecandlestick-data) · [WebSocket de velas](https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md#klinecandlestick-streams-for-utc) · [Limite por IP](https://www.binance.com/en/support/faq/detail/360004492232)

La consulta ya se probo con BTCUSDT y ETHUSDT desde Argentina. El endpoint Spot devuelve hasta 12 valores por vela, en un array posicional.

### Kraken Spot

Los datos publicos no requieren cuenta ni API key. Las velas se consultan en `https://api.kraken.com/0/public/OHLC`; el WebSocket v2 `wss://ws.kraken.com/v2` tiene un canal publico `ohlc` que actualiza con cada operacion. Kraken recomienda no superar una consulta por segundo para los endpoints publicos OHLC y Trades; el limite se aplica por IP y par. La respuesta incluye hasta 720 velas y la ultima todavia esta abierta. Kraken usa `XBT` para Bitcoin y entrega el tiempo en segundos, por lo que hay que adaptar el simbolo y el timestamp. [REST OHLC](https://docs.kraken.com/api/docs/rest-api/get-ohlc-data) · [WebSocket OHLC](https://docs.kraken.com/api/docs/websocket-v2/ohlc) · [Limites](https://support.kraken.com/articles/206548367-what-are-the-api-rate-limits-)

### OKX Spot

Las rutas publicas de mercado no requieren API key. Las velas se consultan en `https://www.okx.com/api/v5/market/candles`; el WebSocket publico `wss://ws.okx.com:8443/ws/v5/public` ofrece el canal `candle1m`. El limite del endpoint de velas es 40 consultas cada dos segundos por IP; el historial tiene un limite separado de 20 cada dos segundos. OKX devuelve un objeto con `code`, `msg` y `data`, donde cada vela es un array de nueve valores. Usa pares como `BTC-USDT`, distintos de los otros candidatos. [REST de velas, WebSocket y limites](https://www.okx.com/docs-v5/en/)

### Acceso desde Argentina

La respuesta real que compartiste confirma que Binance respondio desde el entorno de trabajo en Argentina. Kraken y OKX ofrecen endpoints publicos, pero falta probar su acceso desde la conexion local; la documentacion no garantiza que la API sea alcanzable desde cualquier red o pais.

## Respuestas y campos

Las respuestas siguientes muestran el formato real de cada endpoint. Binance corresponde a nuestra prueba; Kraken y OKX usan ejemplos de sus documentaciones oficiales.

**Binance — `GET /api/v3/klines`**

```json
[[1790414340000,"83988.00000000","83990.01000000","83988.00000000","83990.01000000","0.22622000",1790414399999,"18999.79325250",122,"0.22060000","18527.77199250","0"]]
```

El orden es `openTime`, `open`, `high`, `low`, `close`, `volume`, `closeTime`, `quoteVolume`, `trades`, volumenes taker y un campo sin uso.

**Kraken — `GET /0/public/OHLC`**

```json
{"error":[],"result":{"XXBTZUSD":[[1688671200,"30306.1","30306.2","30305.7","30305.7","30306.1","3.39243896",23]],"last":1688672160}}
```

Cada fila trae tiempo, OHLC, VWAP, volumen y cantidad de operaciones. [Ejemplo oficial](https://docs.kraken.com/api/docs/rest-api/get-ohlc-data)

**OKX — `GET /api/v5/market/candles`**

```json
{"code":"0","msg":"","data":[["1597026383085","3.721","3.743","3.677","3.708","8422410","22698348.04828491","12698348.04828491","0"]]}
```

Cada fila contiene `ts`, OHLC, `vol`, `volCcy`, `volCcyQuote` y `confirm`. `confirm` vale `0` para una vela abierta y `1` para una cerrada, asi que se puede usar para no guardar velas incompletas. [Ejemplo oficial](https://www.okx.com/docs-v5/en/)

Para los graficos iniciales conservamos tiempo de apertura, OHLC y volumen base. Tambien guardamos el tiempo de cierre y el volumen cotizado cuando el exchange lo provee. Dejamos para mas adelante la cantidad de operaciones y los datos taker; descartamos los campos que el proveedor marca como no utilizados. `market.mjs` imprime la respuesta completa; este filtro se aplicara al integrarla con la app.

Binance es la mejor opcion inicial porque cumple los requisitos, ya fue probado desde Argentina y su formato es el que estamos usando. La decision no impide sumar otros exchanges: cada fuente se adapta al mismo formato interno.
