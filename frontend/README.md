# frontend

En esta carpeta se ubicara todo lo relacionado a la interfaz, lo que el usuario ve y lo que hace. Recibe los eventos del substrato de terminal, los pasa al dominio y muestra el resultado.

Para mantener la regla de *cada capa habla con la inferior, no la superior*, el codigo de esta carpeta solo puede pedirle datos al dominio y dibujar al substrato, pero no abre archivos, no gestiona la conexion con los exchanges, ni escribe secuencias ANSI.

## Estructura

- El modelo de la app se ubicara en `estado/`, gestionando el estado de la sesion, el simbolo e intervalo que esta siendo usado, la watchlist, y el registro de eventos
- En `features/` se ubicaran las pantallas donde el usuario escribe, como la watchlist, el CRUD de alertas, diario de operaciones, notas y buscador de simbolos
- En `graficos/` se gestionara el grafico de velas, con el precio, indicadores y la forma de exportar el informe HTML
- En `vistas/` se diseñaran los paneles y la navegacion, con las divisiones de pantalla, la tabla con metricas, el detalle de cada simbolo y la ayuda