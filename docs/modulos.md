# Lista de modulos

Definimos la prioridad de la siguiente forma:

- **P0** - lo que necesita el sistema para funcionar como producto minimo viable
- **P1** - lo que completa la propuesta y es la primera extension
- **P2** - la vision para la evolucion del proyecto

## P0 - MVP

| Modulo | Ubicacion | Que hace |
| ------ | --------- | -------- |
| substrato ANSI | `backend/terminal` | secuencias de escape, paleta de colores y medicion del ancho del texto |
| teclado y mouse | `backend/terminal` | convierte bytes que llegan por stdin en eventos de teclado y mouse |
| componentes | `backend/terminal` | elementos para armar las pantallas: texto, tablas, input, cajas y bordes |
| render + diff | `backend/terminal` | vuelve a pintar las lineas que cambiaron desde el frame anterior |
| ciclo de vida y eventos | `backend/terminal` | deja la terminal lista al entrar y como estaba al salir |
| almacenamiento de mercado | `backend/datos` | guarda y lee las velas en JSONL |
| almacenamiento del usuario | `backend/datos` | guarda y lee watchlist, alertas, operaciones, notas y configuracion |
| conexion REST de exchange | `backend/red` | consulta las velas y el ticker que dice la configuracion |
| normalizador de respuestas | `backend/red` | lleva la respuesta de cada exchange al formato interno |
| indicadores basicos | `backend/metricas` | media simple, media exponencial, RSI y volumen medio |
| metricas de operaciones | `backend/metricas` | PnL, win rate, profit factor y valor esperado |
| layout y navegacion | `frontend/vistas` | reparte pantalla en paneles y mueve el foco |
| grafico de velas | `frontend/graficos` | dibuja precio, las velas y los indicadores |
| watchlist con precio en vivo | `frontend/features` | lista de simbolos con el ultimo precio y su variacion |

## P1 - Extension

| Modulo | Ubicacion | Que hace |
| ------ | --------- | -------- |
| WebSocket | `backend/red` | recibe velas actualizadas sin volver a consultar |
| motor de alertas | `backend/metricas` | evalua condiciones configuradas y avisa cuando se cumplen |
| CRUD de alertas | `frontend/features` | la pantalla para crear, modificar y activar alertas |
| CRUD de operaciones | `frontend/features` | el diario, con el formulario de entrada y salida |
| vista de metricas propias | `frontend/vistas` | panel con metricas, filtrable |
| notas del usuario | `frontend/features` | observaciones libres, buscables y etiquetables |

## P2 - Evolucion

| Modulo | Ubicacion | Que hace |
| ------ | --------- | -------- |
| servidor publico | `backend/red` | sirve el historial ya descargado por HTTP |
| noticias por RSS | `backend/red` | una fuente propia de informacion |
| indicadores personalizados en js | `backend/metricas` | API documentada para sumar indicadores propios |
| backtesting de estrategias | `backend/metricas` | ejecutar una estrategia sobre el historial |
| ayuda y atajos | `frontend/vistas` | pantalla de ayuda y la lista de teclas |