# Trabajo Final - Barrios, Gerbino

El sistema es una herramienta de monitoreo y analisis de mercados financieros en tiempo real, para operadores independientes. Reune en una sola pantalla los precios que llegan de los exchanges, los graficos de velas con indicadores, las alertas que el usuario configura y su propio registro de operaciones, brindando metricas a partir de ese registro.

El objetivo no es competir con una plataforma comercial, sino aportar un lugar donde centralizar la informacion que hoy esta repartida entre varias, y permitir que los usuarios puedan extender la herramienta con codigo propio.

La propuesta original planteaba el despliegue 100% local, sin cuentas, dependencias o infraestructura. Esa decision se mantiene para el sistema central ya que es la que ordena todo lo demas, sumando una parte con deploy para cumplir con la consigna.

## Integrantes

- **Facundo Gerbino** - [@octantes](https://github.com/octantes)
- **Gonzalo Barrios** - [@Goonza88](https://github.com/Goonza88)

## Entrega final

| Documento | Enlace |
| --------- | ------ |
| sistema desplegado | pendiente |
| informe final (PDF) | pendiente |
| video de presentacion | pendiente |
| propuesta del trabajo | [`docs/propuesta.md`](docs/propuesta.md) |
| arquitectura del proyecto | [`docs/arquitectura.md`](docs/arquitectura.md) |
| listado de modulos | [`docs/modulos.md`](docs/modulos.md) |
| investigacion de exchanges | [`docs/exchanges.md`](docs/exchanges.md) |
| esquema de la base de datos | [`database/database.md`](database/database.md) |
| DDL de la base de datos | [`database/schema.sql`](database/schema.sql) |
| contrato de datos | [`database/contrato.md`](database/contrato.md) |
| capa de backend | [`backend/README.md`](backend/README.md) |
| capa de frontend | [`frontend/README.md`](frontend/README.md) |

## Instalacion, ejecucion y testing

El unico requisito es **Node 24 LTS**. No hay `package.json` ni dependencias, por lo que no hace falta `npm install`.

```sh
git clone https://github.com/Goonza88/Trabajo_Final_Barrios_Gerbino.git
cd Trabajo_Final_Barrios_Gerbino
nvm use                              # toma la version de .nvmrc
node main.mjs
```

La pantalla de inicio usa `m` para abrir el monitor (la aplicacion principal), `d` para las demos del substrato y `q` para salir.

El monitor muestra la watchlist a la izquierda, el grafico del simbolo elegido y, al marcar una orden, la caja de la orden. La ayuda con todas las teclas se ve siempre al pie de la lista de simbolos, a la izquierda del grafico.

```sh
node --test                                     # toda la suite
find . -name '*.mjs' -exec node --check {} \;   # chequeo de sintaxis
```

La integracion continua (`.github/workflows/ci.yml`) corre los dos pasos en cada push. Los tests de la capa de datos usan `node:sqlite`, por lo que Node muestra un aviso de modulo experimental que no es un error.

### Variables de entorno

El sistema no usa variables de entorno, claves ni credenciales: los datos de mercado salen de endpoints publicos de Binance. Por eso el repositorio no incluye un `.env`.

## Documentacion y estructura

```md
Trabajo_Final_Barrios_Gerbino/
├── .github/                      # integracion continua
│   └── workflows/ci.yml          > chequea sintaxis y corre los tests en cada push
├── backend/                      # la infraestructura y el procesamiento
│   ├── datos/                    / persistencia sobre SQLite - conexion, migraciones y repositorios
│   │   └── contrato/             / vocabularios, catalogo inicial y validaciones que importa sqlite
│   ├── dominio/                  / usos que coordinan ingesta y persistencia
│   ├── metricas/                 / indicadores y metricas de operaciones
│   ├── red/                      / los conectores con los exchanges
│   ├── terminal/                 / el sustrato de terminal
│   └── README.md                 > que entra en esta capa y que no
├── database/                     # el esquema y el contrato de datos
│   ├── contrato.md               > la especificacion de la capa de datos (metodos, reglas y errores)
│   ├── database.md               > diagrama, campos, tipos, claves y relaciones
│   └── schema.sql                > el DDL de la base de datos
├── demo/                         # demos manuales del substrato
│   ├── *-demo.mjs                > demos especificas de partes del substrato
│   └── menu.mjs                  > elige y ejecuta cada demo
├── docs/                         # documentacion de diseño
│   ├── arquitectura.md           > las capas y el diagrama de arquitectura
│   ├── exchanges.md              > investigacion de los exchanges candidatos
│   ├── modulos.md                > los modulos, segun su prioridad
│   └── propuesta.md              > la propuesta del trabajo, primera entrega
├── frontend/                     # la capa de interfaz
│   ├── estado/                   / el modelo de la app en memoria
│   ├── features/                 / watchlist en vivo, buscador, orden, diario con notas y avisos
│   ├── graficos/                 / el grafico de velas, componentes, niveles y logo ascii
│   ├── formato.mjs               > formato de precios, montos, lados y fechas
│   ├── paleta.mjs                > los colores del proyecto por rol
│   ├── vistas/                   / paneles y medidas, navegacion, mira, ayuda y pantalla de carga
│   └── README.md                 > que entra en esta capa y que no
├── test/                         # la suite de tests
│   └── *.test.mjs                > tests para todas las capas - se ejecutan con node --test
├── .gitignore                    > ignoramos la base de datos generada para no subirla
├── .nvmrc                        > node 24 LTS - la version que usan nvm y la CI
├── main.mjs                      > entrypoint de la app
└── README.md                     > este archivo
```

### Tecnologias

- **Node.js** es el runtime del proyecto y ademas trae el motor de base de datos; mantener todo en node permite que extension y substrato se escriban en el mismo lenguaje
- **SQLite** a traves del modulo nativo `node:sqlite` - la base de datos del sistema, sin dependencias externas ni servidor
- **Modulos nativos** ESM con la extension `.mjs`, que permite que los modulos se ejecuten sin depender de la extension del paquete, haciendo innecesario un `package.json`

### Decisiones y justificacion

**Proyecto local, con base de datos, sin dependencias:** El motor viene embebido en Node (`node:sqlite`), se guarda en un solo archivo y no necesita servidor ni instalacion. Ganamos integridad y consultas reales manteniendo el deploy 100% local, acorde a la propuesta de valor.

**Por que `node:sqlite`:** Node trae embebido el motor real de SQLite, no un envoltorio, asi que el motor de base de datos completo viene dentro del runtime de forma nativa. Eso nos permite cumplir el requisito de integrar un motor de base de datos real al proyecto, y al mismo tiempo mantener la propuesta sin dependencias. El unico requisito es fijar la version de node a **Node 24 LTS**.

**No se guardan credenciales:** La conexion con los exchanges se realiza a traves de endpoints publicos que no requieren API key, y no se almacenan contraseñas ni datos sensibles. No se requiere login, y la informacion del usuario esta en la base SQLite (`data/app.db`), portable, facil de respaldar y sin nada que proteger.

**La interfaz es de terminal, no web:** Es la decision que mas diferencia al proyecto, y la mas dificil de implementar. La tesis de la propuesta es justamente que un operador trabaja con la app abierta todo el dia, y necesita centralizar la informacion en un sistema liviano y rapido.

### Limitaciones

- **las operaciones son de practica** - el sistema recibe informacion real y simula las operaciones sobre el precio en vivo, pero no envia las ordenes al exchange
- **un solo exchange** - los datos salen de los endpoints publicos de Binance, sin ellos no hay precios ni velas
- **precios por consulta** - las velas y los tickers se piden y actualizan cada 5 segundos

### Propuesta de Despliegue (Etapa Final)

Como la etapa final pide que hosteemos algo, proponemos las siguientes opciones:

- **Informe HTML:** La app genera un archivo .html con toda la informacion y metricas de las operaciones que realizo el usuario. Esta opcion puede extenderse para mostrar en vivo como va determinada operacion, por ejemplo, el PnL actualizandose en vivo, con alertas a remoto basadas en una feed RSS.
- **Dashboard publico:** Un servidor de datos publicos que se despliega en un servidor Node y puede ser consumido por distintas instalaciones con `fuente: remoto`. Publica datos publicos de mercado, permitiendo ver la informacion en tiempo real, y se podria sumar una visualizacion en tiempo real para chequear las operaciones abiertas a distancia.