# Trabajo Final: Propuesta

**Autores:** Gonzalo Barrios - Facundo Gerbino

## Parte Uno - Identificacion de la problematica

### Identificacion de la problematica

Los operadores independientes que realizan analisis de mercados financieros utilizan multiples herramientas desconectadas para obtener informacion, procesarla y tomar decisiones.

En un flujo de trabajo tipico, esto implica combinar un exchange para consultar precios y ejecutar operaciones, una plataforma de graficos para analizar el mercado, canales de comunicacion para seguir noticias y eventos relevantes, y herramientas para registrar operaciones y evaluar resultados.

Aunque cada una de estas soluciones cumple una funcion especifica, ninguna integra el proceso completo de analisis. Esto genera fragmentacion de datos, perdida de tiempo operativo y dificultades para adaptar el entorno de trabajo a las necesidades particulares de cada usuario.

La resolucion de estos puntos de dolor no solo mejoraria la experiencia del usuario, sino que tambien facilitaria la integracion de nuevas fuentes de informacion y el desarrollo de herramientas de analisis personalizadas.

### Puntos de dolor

- La informacion relevante se encuentra distribuida entre multiples plataformas, obligando al usuario a cambiar constantemente de contexto durante el analisis y dificultando obtener una vision integrada del mercado.
- Cada herramienta utiliza sus propios formatos, mecanismos de acceso y modelos de interaccion, dificultando la interoperabilidad entre ellas.
- Los usuarios avanzados tienen dificultades para adaptar las herramientas comerciales a estrategias especificas o extender su funcionamiento debido a su naturaleza cerrada.
- El historial de operaciones, analisis y observaciones personales suele quedar separado de los datos del mercado, impidiendo relacionar ambos conjuntos de informacion para obtener nuevos analisis.
- Muchas soluciones existentes requieren suscripciones para acceder a funcionalidades avanzadas, limitando el acceso a herramientas de personalizacion y analisis.

Actualmente, muchas soluciones comerciales procesan la informacion en sus propios servidores y entregan al usuario unicamente una representacion final de los datos. Esto genera dependencia de la infraestructura del proveedor y limita la posibilidad de personalizar ese procesamiento.

Una alternativa a este modelo consiste en trasladar parte del procesamiento hacia el dispositivo del usuario, permitiendo que los datos obtenidos desde fuentes publicas sean procesados y analizados localmente. De esta forma, el principal cuello de botella deja de ser la infraestructura del proveedor y pasa a depender de la capacidad de procesamiento del equipo del usuario y de la eficiencia del software, dos variables sobre las que existe un mayor grado de control.

Ademas de reducir la dependencia de servicios externos, este enfoque facilita la personalizacion del procesamiento de datos y la construccion de herramientas especificas sobre una infraestructura abierta.

### Contexto e impacto

El problema afecta principalmente a dos grupos de usuarios. Las problematicas seran validadas mediante entrevistas o relevamientos a operadores independientes, identificando las herramientas que utilizan actualmente, el flujo de trabajo habitual y las principales dificultades encontradas durante el analisis de mercado.

#### Operadores independientes que analizan informacion financiera para la toma de decisiones:

<table width="100%">
  <thead>
    <tr>
      <th width="50%">Necesidades<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==" width="400" height="1"></th>
      <th width="50%">Problemas actuales<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==" width="400" height="1"></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Visualizar precios en tiempo real</td>
      <td>Uso de multiples plataformas simultaneas</td>
    </tr>
    <tr>
      <td>Analizar indicadores tecnicos</td>
      <td>Indicadores limitados por software comercial</td>
    </tr>
    <tr>
      <td>Configurar alertas personalizadas</td>
      <td>Dependencia de servicios externos</td>
    </tr>
    <tr>
      <td>Comparar distintos mercados</td>
      <td>Informacion distribuida</td>
    </tr>
    <tr>
      <td>Registrar operaciones y observaciones</td>
      <td>Falta de integracion entre analisis e historicos</td>
    </tr>
    <tr>
      <td>Crear metricas propias</td>
      <td>Barreras tecnicas en herramientas existentes</td>
    </tr>
  </tbody>
</table>

#### Desarrolladores o analistas que desean crear herramientas propias sobre datos de mercado:

<table width="100%">
  <thead>
    <tr>
      <th width="50%">Necesidades<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==" width="400" height="1"></th>
      <th width="50%">Problemas actuales<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==" width="400" height="1"></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Acceder a datos de mercado sin procesar</td>
      <td>APIs fragmentadas entre proveedores</td>
    </tr>
    <tr>
      <td>Probar estrategias</td>
      <td>Necesidad de construir infraestructura propia</td>
    </tr>
    <tr>
      <td>Visualizar resultados</td>
      <td>Falta de integracion entre analisis y visualizacion</td>
    </tr>
    <tr>
      <td>Extender funcionalidades con codigo</td>
      <td>Plataformas cerradas con poca configuracion</td>
    </tr>
  </tbody>
</table>

## Parte Dos - Propuesta de solucion

La propuesta consiste en desarrollar un sistema modular de monitoreo y analisis de mercados financieros en tiempo real para operadores independientes, orientado a centralizar el acceso, procesamiento y visualizacion de informacion proveniente de distintas fuentes.

Si bien se implementara una interfaz de terminal inicial, el foco sera preparar el sustrato modular para permitir la mayor extension y modificacion posible. Por eso, el objetivo no es competir con plataformas existentes como TradingView a traves de la cantidad de herramientas incorporadas.

#### Producto minimo viable y vision de evolucion:

<table width="100%">
  <thead>
    <tr>
      <th width="50%">Producto minimo viable<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==" width="400" height="1"></th>
      <th width="50%">Vision de evolucion<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==" width="400" height="1"></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Conexion con exchanges mediante APIs y WebSockets</td>
      <td>API documentada para acceso a datos</td>
    </tr>
    <tr>
      <td>Recepcion y procesamiento en tiempo real</td>
      <td>Integracion de fuentes propias, como feeds RSS</td>
    </tr>
    <tr>
      <td>Generacion de graficos de velas con indicadores</td>
      <td>Desarrollo de estrategias automatizadas</td>
    </tr>
    <tr>
      <td>Implementacion de indicadores basicos</td>
      <td>Creacion de indicadores personalizados con JavaScript</td>
    </tr>
    <tr>
      <td>Sistema de alertas configurables</td>
      <td>Interfaz modular, extensible y personalizable</td>
    </tr>
    <tr>
      <td>Registro de operaciones y observaciones personalizadas</td>
      <td>Analisis historico de operaciones con calculo de metricas personalizadas, como EV y win rate</td>
    </tr>
  </tbody>
</table>

## Parte Tres - Stack tecnologico

La eleccion de tecnologias responde principalmente a la naturaleza del problema: procesamiento de datos en tiempo real, comunicacion mediante WebSockets y necesidad de mantener una arquitectura simple y extensible. El stack inicial estara compuesto por JavaScript y Node.js.

Como posibilidad futura, se evaluara la incorporacion de WebAssembly para ejecutar componentes desarrollados en lenguajes como Rust en aquellas operaciones donde el rendimiento sea critico. Esto se decidira luego de realizar pruebas de rendimiento sobre el codigo nativo.

La utilizacion de JavaScript permite utilizar un unico lenguaje tanto para la interfaz como para la logica del sistema. Ademas, Node.js cuenta con un modelo de ejecucion orientado a operaciones de entrada y salida no bloqueantes, lo que resulta util para aplicaciones que reciben continuamente informacion desde fuentes externas.

La utilizacion de WebSockets permite mantener conexiones persistentes con proveedores de datos financieros, reduciendo la latencia y evitando consultas constantes.

Otro motivo para utilizar JavaScript es la facilidad de extension. Al permitir que los usuarios puedan crear componentes propios mediante el mismo lenguaje utilizado por el sustrato, se reduce la barrera tecnica para personalizar el sistema.

El sistema sera desplegado localmente en el dispositivo del usuario. Esta decision reduce los costos de infraestructura, mantiene la privacidad de los datos generados por el usuario, evita la dependencia de servicios externos y aprovecha los recursos computacionales disponibles localmente.

## Parte Cuatro - Analisis FODA

<table width="100%">
  <thead>
    <tr>
      <th width="50%">Fortalezas<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==" width="400" height="1"></th>
      <th width="50%">Oportunidades<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==" width="400" height="1"></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Arquitectura modular y extensible</td>
      <td>Interes por herramientas financieras personalizadas</td>
    </tr>
    <tr>
      <td>No requiere infraestructura externa obligatoria</td>
      <td>Posibilidad de crear una comunidad que extienda el sistema</td>
    </tr>
    <tr>
      <td>Permite la personalizacion mediante codigo</td>
      <td>Interes por soluciones locales sin dependencias</td>
    </tr>
    <tr>
      <td>Uso de tecnologias conocidas y muy utilizadas</td>
      <td>Mayor disponibilidad de APIs publicas</td>
    </tr>
  </tbody>
</table>

<table width="100%">
  <thead>
    <tr>
      <th width="50%">Debilidades<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==" width="400" height="1"></th>
      <th width="50%">Amenazas<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==" width="400" height="1"></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Requiere conocimientos tecnicos para aprovechar todas sus capacidades</td>
      <td>Plataformas comerciales consolidadas con gran cantidad de usuarios</td>
    </tr>
    <tr>
      <td>No cuenta inicialmente con la cantidad de herramientas que poseen las plataformas comerciales</td>
      <td>Cambios en las APIs publicas de proveedores de datos</td>
    </tr>
    <tr>
      <td>El procesamiento local puede limitarse segun el hardware disponible</td>
      <td>Complejidad creciente al intentar incorporar demasiadas funcionalidades</td>
    </tr>
  </tbody>
</table>

### Viabilidad y riesgos

La viabilidad inicial del proyecto es alta debido a que el MVP no requiere cuentas de usuario, pagos, integracion con brokers ni ejecucion real de operaciones financieras. El sistema solamente consume datos publicos y permite realizar analisis sobre ellos.

El principal riesgo tecnico consiste en la cantidad y velocidad de datos generados por los mercados financieros. Para reducir este riesgo, el alcance inicial estara limitado a un conjunto reducido de activos y datos fundamentales, como BTC/USDT y ETH/USDT, priorizando la correcta implementacion del flujo completo antes que la cantidad de funcionalidades.

Otro de los riesgos principales es intentar construir una plataforma comparable a soluciones comerciales completas. Por este motivo, el proyecto se enfocara en resolver la problematica especifica de centralizacion, personalizacion y procesamiento de informacion, dejando fuera funcionalidades avanzadas que no sean necesarias para validar la propuesta.
