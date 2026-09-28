# backend

En esta carpeta se ubicara todo lo relacionado con la infraestructura y el procesamiento de datos. Todo lo que la interfaz en si no debe manejar, como la conexion con los exchanges, la gestion de datos, calculos de indicadores y la implementacion de la terminal.

Para mantener la regla de *cada capa habla con la inferior, no la superior*, nada en esta carpeta debe importar a `/frontend`.

## Estructura

- La persistencia se gestiona en `datos/`, que lee y escribe en `data/market/` y `data/user/` armando los indices en memoria y validando contra `/database/database.md`
- En `metricas/` se realizan los calculos de indicadores tenicos sobre el grafico de velas y los valores derivados del registro de operaciones: PnL, win rate, profit factor y valor esperado
- En `red/` se implementan los conectores de exchange, gestionando la conexion por REST y WebSocket, normalizando las respuestas al formato interno
- En `terminal/` se implementara el substrato de terminal, con gestion de codigos de escape, input por mouse y teclado, componentes/widgets, rendering y ciclo de vida. Es la parte central y mas importante de todo el proyecto