# Decisiones de Diseño

En este documento dejaremos planteados los objetivos de cada archivo en el repositorio, y las decisiones que tomamos en cada instancia de trabajo.

> Para correr la terminal en su estado actual: `node main.mjs` en la raiz del repositorio.

Separamos el codigo que cualquier aplicacion de terminal necesita (pintar, capturar teclado y mouse, runtime) de la herramienta de trading, para no contaminar la logica de dominio (conexion con exchanges, manejo de datos, graficos, etc). Separarlos permite la reutilizacion en cualquier herramienta futura.

```
Trabajo_Final_Barrios_Gerbino/
├── README.md                    # propuesta del trabajo
├── main.mjs                     # punto de entrada, por ahora carga las demos
├── docs/                        # documentacion del proyecto
│   └── diseño.md                # - decisiones de diseño (este documento)
├── src/                         # substrato de la terminal
│   ├── ansi.mjs                 # - escapes, color, medición unicode
│   └── input.mjs                # - stdin a eventos de teclado/mouse
├── app/                         # logica de dominio (trading)
└── test/                        # capa de pruebas
    └── demo.mjs                 # - test interactivo de ansi + input
```

## ansi.mjs

La terminal no es una interfaz grafica, sino un flujo de texto sobre una grilla de celdas de ancho fijo. Todo se comunica mediante **secuencias de escape**, texto invisible que comienza con el codigo de Esc (como `\x1b[H`, que significa "enviar cursor al inicio").

Una aplicacion de terminal con interfaz no puede existir sin manejar este vocabulario, sin el, no habria forma de renderizar texto de color, posicionar el cursor o incluso limpiar la pantalla. Este vocabulario esta definido en el estandar [ECMA-48](https://ecma-international.org/publications-and-standards/standards/ecma-48/) y su articulo en [Wikipedia](https://en.wikipedia.org/wiki/ANSI_escape_code) cuenta con las tablas de secuencias que necesitamos.

Manejar esas secuencias de escape cada vez que queremos hacer algo es inviable, por eso lo unificamos en `ansi.mjs`, permitiendo que las capas superiores declaren intencion y esta capa las convierta a los bytes que necesitamos. Las dos funciones son:

- Producir los bytes correctos usando el vocabulario de ordenes `escape`, la traduccion de estilos `toAnsi` y la paleta por rol.
- Leer y ajustar texto para pintarlo en la grilla, midiendo el ancho unicode para caracteres que ocupan mas o menos de una celda, limpiando texto con escapes y recortando a anchos visibles.

## input.mjs

El teclado y el mouse llegan a la terminal como bytes. Una tecla puede ser una secuencia de 1 a 8+ bytes, y como el stdin no respeta limites de secuencia, cada chunk puede cortarla en cualquier punto (tecla partida entre dos chunks, un Esc que llego solo pero era el prefijo de otra cosa, etc).

Esta capa de entrada se encarga de tomar esos bytes y convertirlos en eventos normalizados para que el resto del substrato los consuma, manejando las particularidades de terminales especificas como xterm. Sin esta centralizacion, cada archivo repetiria el mismo codigo de parseo fragil y habria que mantener la paridad manualmente.

Cada byte se convierte en un evento con una forma estable:

- Teclado: `{ type: 'key', key, shift, alt, ctrl }`
- Mouse: `{ type: 'mouse', btn, col, row, phase, dx, dy }`

Las secuencias se resuelven con tablas (`KEYS` y `FINALS`/`TILDES`) mas los controles de texto plano (Ctrl+C, Enter, Tab, Backspace). Como los chunks se cortan donde quieren, el `Dispatcher` guarda estado entre chunks. Un caracter cortado se retiene hasta completar y una secuencia incompleta espera hasta su byte final antes de emitirla.

La tecla Esc es el prefijo, por lo que cuando llega solo, no se sabe si el usuario presiono la tecla o es el inicio de una secuencia. Para manejar ese caso, implementamos un timer de 30ms que emite el evento de la tecla si no llega otro byte.

Para capturar el estado del mouse, usamos [SGR](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html), cuyo reporte es ASCII y un solo formato distingue boton, columna y fila. A partir de eso, derivamos las fases (down/drag/move/up/scroll), que requieren el estado del mouse dentro del `Dispatcher` para distinguir entre las distintas acciones.