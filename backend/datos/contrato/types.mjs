// vocabulario y datos fijos del contrato de datos - lo importa la implementacion de sqlite

export const INTERVALS = ['1m', '5m', '1h', '4h', '1d']; // intervalos habilitados

// tipos de alerta, con el campo que les corresponde (pareja exigida por el CHECK de la tabla)
// en indicador, el campo es el nombre del indicador y lo valida el dominio
export const ALERT_TYPES = ['precio', 'variacion', 'volumen', 'indicador'];

export const FIELD_BY_TYPE = {
  precio: 'price',
  variacion: 'change24h',
  volumen: 'volume24h',
};

export const ALERT_OPERATORS = ['>', '>=', '<', '<=', '==', 'cruza_arriba', 'cruza_abajo'];
export const OPERATION_SIDES = ['compra', 'venta'];
export const ORDER_TYPES = ['mercado', 'limite'];
export const OPERATION_STATES = ['abierta', 'cerrada', 'cancelada'];
export const CONFIG_SOURCES = ['local', 'remoto'];

// catalogo inicial de la base - lo cargan las migraciones (valores velas/limites en docs/exchanges.md)
export const INITIAL_CATALOG = {

  exchange: [
    {
      id: 'binance',
      nombre: 'Binance',
      base_url: 'https://data-api.binance.vision',
      ws_url: 'wss://stream.binance.com:9443',
      peso_por_consulta: 2,
      limite_por_minuto: 6000,
    },
  ],

  simbolos: [
    { exchange_id: 'binance', symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT' },
    { exchange_id: 'binance', symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT' },
  ],

};