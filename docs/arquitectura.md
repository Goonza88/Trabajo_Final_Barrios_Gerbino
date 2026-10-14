# Arquitectura del proyecto

Este documento describe la arquitectura del sistema, organizada en capas. El modelo de datos esta en [`/database`](../database), el detalle de cada modulo en [modulos.md](modulos.md) y las tecnologias con sus decisiones, en el [README](../README.md).

## Capas

Elegimos una arquitectura por capas: cada capa habla con la de abajo, nunca con la de arriba. Mantener esa regla central es lo que habilitara la extensibilidad, ya que permitira que un indicador se sume al dominio sin tocar la interfaz, un widget se sume a la interfaz sin tocar el dominio, o un exchange nuevo se sume a los conectores.

- La **interfaz** recibe lo que el usuario hace y muestra el estado, sin gestionar input ni render
- El **dominio** calcula indicadores y metricas de operaciones, sin saber que existe una terminal
- La **persistencia** guarda y consulta en la base SQLite, sin hacer calculos de indicadores ni metricas
- Los **conectores** hablan con los exchanges, sin saber nada del resto de la app
- El **sustrato de terminal** maneja la pantalla y el teclado, sin saber nada de trading

```mermaid
graph TD
    UI["interfaz<br>/frontend"]
    DOM["dominio<br>/backend/metricas"]
    DATOS["persistencia<br>/backend/datos"]
    RED["conectores<br>/backend/red"]
    TERM["sustrato de terminal<br>/backend/terminal"]
    EXCH["exchanges"]
    BD["SQLite<br>data/app.db"]

    UI -->|"pide datos"| DOM
    DOM -->|"lee y escribe"| DATOS
    DATOS -->|"pide velas y tickers"| RED
    RED -->|"REST y WebSocket"| EXCH
    RED -->|"normaliza y entrega"| DATOS
    DATOS -->|"guarda y consulta"| BD
    UI -->|"pinta con"| TERM
    RED -->|"emite eventos"| TERM
    TERM -->|"devuelve eventos"| UI
```

La persistencia es la unica capa que escribe SQL, y el resto del sistema accede a los datos a traves de sus repositorios. El detalle esta en [`/database/database.md`](../database/database.md).