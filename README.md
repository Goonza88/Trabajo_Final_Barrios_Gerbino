# Trabajo Final - Barrios, Gerbino

El proyecto contempla dos capas modulares para cumplir la propuesta:

Por un lado, la **capa de terminal**, que centraliza la logica necesaria para manejar una TUI, y permitira que los usuarios sean capaces de extender la herramienta de forma simple, usando una API documentada.

Sobre ese substrato, se construira la **capa de aplicacion**, que contendra la funcionalidad de cara al usuario, la conexion con las APIs de las que recibiremos informacion de mercados, y las herramientas con las que se podra operar sobre esta.

```
Trabajo_Final_Barrios_Gerbino/
├── README.md                    # indice: como correr el proyecto y a donde mirar
├── propuesta.md                 # la propuesta del trabajo
├── main.mjs                     # punto de entrada, menu de los demos
├── src/                         # substrato de la terminal
│   ├── ansi.mjs                 # - escapes, color, medición unicode
│   ├── input.mjs                # - stdin a eventos de teclado/mouse
│   ├── runtime.mjs              # - ciclo de vida y cola de eventos
│   ├── view.mjs                 # - arbol > lineas pintables > render por diff
│   ├── widgets.mjs              # - los componentes declarativos que se muestran
│   └── README.md                # - decisiones de diseño de la capa de terminal
├── app/                         # logica de dominio (trading)
│   ├── market.mjs               # - prueba de API: conecta con Binance e imprime
│   └── README.md                # - decisiones de diseño de la capa de aplicacion
└── test/                        # capa de pruebas
    ├── input-demo.mjs           # - test interactivo de ansi + input
    ├── view-demo.mjs            # - test de widgets + view + runtime
    └── runtime-demo.mjs         # - test interactivo del runtime
```

## Documentacion

Cada capa tiene un README que documenta el diseño del trabajo realizado:

| documento | contenidos |
| --------- | ---------- |
| [`propuesta.md`](propuesta.md)   | la propuesta inicial del trabajo, realizada para la entrega uno            |
| [`src/README.md`](src/README.md) | el substrato de la terminal y la explicacion de cada modulo                |
| [`app/README.md`](app/README.md) | la investigacion y decisiones de integracion de exchanges y almacenamiento |

## Como Ejecutar

La unica dependencia es **Node 18 o superior** - No hay nada que instalar ni `package.json`

```bash
node main.mjs
```

Cada demo del substrato prueba una capa distinta, y se pueden ejecutar directamente o utilizando el menu CLI de `main.mjs`. Cada demo puede cerrarse con `q` o `Ctrl+c`.

| comando | que prueba |
| ------- | ---------- |
| `node test/view-demo.mjs`    | widgets, layout e input de una linea      |
| `node test/runtime-demo.mjs` | reloj, cola de eventos, resize y errores  |
| `node test/input-demo.mjs`   | ansi y teclado crudo, sin usar el runtime |