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
| conexion y migraciones | `backend/datos` | abre la base SQLite, aplica los `PRAGMA` y crea el esquema |
| catalogo de exchanges y simbolos | `backend/datos` | mantiene `exchange`, `simbolo` y `simbolo_intervalo` |
| repositorio de mercado | `backend/datos` | guarda y consulta las velas y los tickers en la base |
| repositorio de usuario | `backend/datos` | guarda y consulta watchlist, alertas, operaciones, notas y configuracion |
| conexion REST de exchange | `backend/red` | consulta las velas y el ticker que dice la configuracion |
| normalizador de respuestas | `backend/red` | lleva la respuesta de cada exchange al formato interno |
| indicadores basicos | `backend/metricas` | media simple, media exponencial, RSI y volumen medio |
| aritmetica decimal | `backend/metricas` | valida y parsea decimales y hace cuentas sin perder precision |
| layout y navegacion | `frontend/vistas` | reparte pantalla en paneles y mueve el foco |
| grafico de velas | `frontend/graficos` | dibuja precio, las velas y los indicadores |
| watchlist con precio en vivo | `frontend/features` | lista de simbolos con el ultimo precio y su variacion |
| registro de operaciones | `frontend/features` | alta, salida y listado del diario de operaciones |

## P1 - Extension

| Modulo | Ubicacion | Que hace |
| ------ | --------- | -------- |
| WebSocket | `backend/red` | recibe velas actualizadas sin volver a consultar |
| motor de alertas | `backend/metricas` | evalua condiciones configuradas y avisa cuando se cumplen |
| CRUD de alertas | `frontend/features` | la pantalla para crear, modificar y activar alertas |
| metricas de operaciones | `backend/metricas` | PnL, win rate, profit factor y valor esperado |
| vista de metricas propias | `frontend/vistas` | panel con metricas, filtrable |
| notas del usuario | `frontend/features` | observaciones libres, buscables y etiquetables |

## P2 - Evolucion

| Modulo | Ubicacion | Que hace |
| ------ | --------- | -------- |
| servidor publico | `backend/red` | sirve el historial ya descargado por HTTP |
| noticias por RSS | `backend/red` | una fuente propia de informacion |
| indicadores personalizados en js | `backend/metricas` | API documentada para sumar indicadores propios |
| backtesting de estrategias | `backend/metricas` | ejecutar una estrategia sobre el historial |
| respaldo de la base | `backend/datos` | copia de seguridad del archivo `data/app.db` |
| ayuda y atajos | `frontend/vistas` | pantalla de ayuda y la lista de teclas |