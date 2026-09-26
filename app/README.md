# Datos de mercado

En esta prueba consultamos velas publicas de Binance para BTCUSDT y ETHUSDT. Usamos `GET /api/v3/klines` con intervalo de un minuto y pedimos una sola vela. El script imprime la respuesta cruda para revisar su formato antes de integrarla a la app. No hace falta una API key para consultar estos datos publicos. [Documentacion de velas](https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#klinecandlestick-data) · [Endpoint de datos publicos](https://developers.binance.com/en/docs/products/spot/rest-api)

## Campos

Cuando integremos el guardado, cada linea tendra una vela en `data/market/<symbol>/<interval>.jsonl`. Nos quedamos con la hora de apertura, OHLC y volumen base, junto con la hora de cierre y el volumen en USDT. El simbolo y el intervalo quedan identificados por la ruta. Conservamos los precios y volumenes como los envia Binance para no perder precision decimal.

Por ahora dejamos afuera la cantidad de operaciones y los volumenes de compra taker: no hacen falta para los graficos OHLCV iniciales y se pueden sumar si despues los necesitamos para otros indicadores. El ultimo campo se descarta porque Binance lo marca como no utilizado.

El filtro se aplicara al guardar los datos; `market.mjs` mantiene la respuesta completa durante esta prueba.
