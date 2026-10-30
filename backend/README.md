# backend

En esta carpeta se ubicara todo lo relacionado con la infraestructura y el procesamiento de datos. Todo lo que la interfaz en si no debe manejar, como la conexion con los exchanges, la gestion de datos, calculos de indicadores y la implementacion de la terminal.

Para mantener la regla de *cada capa solo pide a la inferior, no a la superior*, nada en esta carpeta debe importar a `/frontend`.

## Estructura

- En `datos/` se gestiona la persistencia, que guarda y consulta en la base SQLite, implementando conexion, migraciones y repositorios. La especificacion de esa capa esta en [`/database/contrato.md`](../database/contrato.md), y en `datos/contrato/` estan los vocabularios, el catalogo inicial y las validaciones que importa la implementacion
- En `dominio/` se implementan casos de uso que coordinan ingesta y persistencia sin saber que existe una terminal. La ingesta concreta queda en `red/`
- En `metricas/` se realizan los calculos de indicadores tecnicos sobre las velas y los valores derivados del registro de operaciones: PnL, win rate, profit factor y valor esperado. Tambien se implementa ahi la aritmetica decimal (`parse` y `formatear`), que valida el formato de lo que carga el usuario (sobre lo que se hacen esas cuentas) para no perder precision
- En `red/` se implementan los conectores de exchange, gestionando la conexion por REST y WebSocket, normalizando las respuestas al formato interno
- En `terminal/` se implementa el substrato de terminal, con gestion de codigos de escape, input por mouse y teclado, componentes/widgets, rendering y ciclo de vida. Es la parte central y mas importante de todo el proyecto

## Persistencia

La capa de persistencia es en SQLite, en un unico archivo `data/app.db`, y es la unica capa que escribe SQL.
El detalle del acceso a los datos y de cada tabla esta en [`/database/database.md`](../database/database.md).