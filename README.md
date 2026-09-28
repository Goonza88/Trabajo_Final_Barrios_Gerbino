# Trabajo Final - Barrios, Gerbino

El sistema es una herramienta de monitoreo y analisis de mercados financieros en tiempo real, para operadores independientes. Reune en una sola pantalla los precios que llegan de los exchanges, los graficos de velas con indicadores, las alertas que el usuario configura y su propio registro de operaciones, brindando metricas a partir de ese registro.

El objetivo no es competir con una plataforma comercial, sino aportar un lugar donde centralizar la informacion que hoy esta repartida entre varias, y permitir que los usuarios puedan extender la herramienta con codigo propio.

La propuesta original planteaba el despliegue 100% local, sin cuentas, dependencias o infraestructura. Esa decision se mantiene ya que es la que ordena todo lo demas.

## Segunda entrega: diseño y modulos

Comenzamos a trabajar sobre la segunda entrega antes de que se suban los requisitos, por lo que sin saberlo nos adelantamos y pasamos a la implementacion. Ese codigo quedo preservado en la branch `wip/substrato-terminal` y no forma parte de esta entrega.

- **estructura del repositorio** - este archivo
- **arquitectura del proyecto** - [`docs/arquitectura.md`](docs/arquitectura.md)
- **listado de modulos** - [`docs/modulos.md`](docs/modulos.md)
- **esquema de la base de datos** - [`database/database.md`](database/database.md)

```md
Trabajo_Final_Barrios_Gerbino/
├── backend/                      # la infraestructura y el procesamiento
│   ├── datos/                    / la persistencia documental en data/
│   ├── metricas/                 / indicadores y metricas de operaciones
│   ├── red/                      / los conectores con los exchanges
│   ├── terminal/                 / el sustrato de terminal
│   └── README.md                 > que entra en esta capa y que no
├── database/                     # el esquema de datos
│   └── database.md              > diagrama, campos, tipos, claves y relaciones
├── docs/                         # documentacion de diseño
│   ├── arquitectura.md           > las capas y el diagrama de arquitectura
│   ├── modulos.md                > los modulos, segun su prioridad
│   └── propuesta.md              > la propuesta del trabajo, primera entrega
├── frontend/                     # la capa de interfaz
│   ├── estado/                   / el modelo de la app en memoria
│   ├── features/                 / pantallas de alta de alertas, operaciones y notas
│   ├── graficos/                 / el grafico de velas y el informe HTML
│   ├── vistas/                   / paneles, navegacion, tablas y ayuda
│   └── README.md                 > que entra en esta capa y que no
└── README.md                     > este archivo
```

## Tecnologias

- **Node 18 o superior** - es el runtime del proyecto, mantener todo en node permite que extension y substrato se escriban en el mismo lenguaje
- **Modulos nativos** ESM con la extension `.mjs`, que permite que los modulos se ejecuten sin depender de la extension del paquete, haciendo innecesario un `package.json`
- **JSON y JSONL** para almacenar los datos, ya que es lo que `fetch` usa nativamente

## Decisiones y justificacion

**Proyecto local, sin servidor ni dependencias:** Un motor de base de datos agregaria una dependencia que instalar, un proceso mas y un paso extra. Para el volumen de datos que maneja el sistema, es complejidad que no aporta ningun beneficio. Se mantiene la organizacion a traves de la division en distintos archivos.

**No se guardan credenciales:** La conexion con los exchanges se realiza a traves de endpoints publicos que no requieren API key, y no se almacenan contraseñas ni datos sensibles. No se requiere login, y la informacion del usuario esta en un archivo JSON, portable, facil de respaldar y sin nada que proteger.

**La interfaz es de terminal, no web:** Es la decision que mas diferencia al proyecto, y la mas dificil de implementar. La tesis de la propuesta es justamente que un operador trabaja con la app abierta todo el dia, y necesita centralizar la informacion en un sistema liviano y rapido.

### Propuesta de Despliegue (Etapa Final)

Como la etapa final pide que hosteemos algo, proponemos las siguientes opciones:

- **Informe HTML:** La app genera un archivo .html con toda la informacion y metricas de las operaciones que realizo el usuario. Esta opcion puede extenderse para mostrar en vivo como va determinada operacion, por ejemplo, el PnL actualizandose en vivo, con alertas a remoto basadas en una feed RSS.
- **Servidor publico:** Un servidor de datos publicos, que se despliega en un servidor Node y lo pueden consumir distintas instalaciones usando `fuente: remoto`. Solo publica datos publicos de mercado, funcionando como un TradingView personalizado.