# frontend

En esta carpeta se ubicara todo lo relacionado a la interfaz, lo que el usuario ve y lo que hace. Recibe los eventos del substrato de terminal, los pasa al dominio y muestra el resultado.

Para mantener la regla de *cada capa solo pide a la inferior, no a la superior*, el codigo de esta carpeta solo puede pedirle datos al dominio y dibujar al substrato, pero no accede a la base de datos, no gestiona la conexion con los exchanges, ni escribe secuencias ANSI.

## Estructura

- El modelo de la app se ubicara en `estado/`, gestionando el estado de la sesion, el simbolo e intervalo que esta siendo usado, la watchlist, las operaciones de practica, las alertas y el registro de eventos
- En `features/` se ubicaran las pantallas donde el usuario escribe, como la watchlist, la orden, el diario de operaciones con sus notas y alertas, los avisos y el buscador de simbolos
- En `graficos/` se gestionara el grafico de velas, con el precio, indicadores, niveles de ordenes y alertas, y el logo
- En `vistas/` se diseñaran los paneles y la navegacion, con las divisiones de pantalla y sus medidas, la mira, las cajas de indicadores, el detalle de cada simbolo, la ayuda y la pantalla de carga