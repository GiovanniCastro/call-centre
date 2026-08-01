# 📘 CALL CENTRE DOCS — Manual de cambios de Perímetro

> Manual vivo del proyecto. Cada cambio de fondo entra aquí con su contexto, qué
> cambió, por qué, y a qué afecta. Lo mantiene la habilidad `call_centre_docs`.
>
> **Regla que manda:** si un documento choca con el código, gana el código y el
> documento se corrige el mismo día.

**Documento:** Manual de cambios · **Proyecto:** Perímetro (call centre)
**Responsable:** Giovanni Castro · **Vault:** [[INDEX]] · **Verdad única:** [[00-CANON]]

---

## Historial de revisiones

| Revisión | Fecha | Entradas | Resumen |
|---|---|---|---|
| **3** | 2026‑08‑01 | R‑024 | Fase 2 construida. El umbral de similitud no puede sostener el invariante 1 por sí solo: medido, y el trabajo se reparte con el verificador de procedencia de la fase 4 |
| **2** | 2026‑07‑31 | R‑012 … R‑023 | Fases 0 y 1 construidas. React fijado para el panel. Repositorio público. Telegram como canal primario. Alcance de contacto en tres capas. Corpus escrito, y reemplazado por el de una aseguradora |
| **1** | 2026‑07‑30 | R‑001 … R‑011 | Revisión del plan, propuesta de desarrollo por fases, arquitectura en dos planos, vault de Obsidian |

---

## Contenido

- [Revisión 2026‑08‑01](#revisión-2026-08-01)
  - [R‑024 · El umbral no sostiene el invariante 1 solo](#r-024--el-umbral-de-similitud-no-puede-sostener-el-invariante-1-por-sí-solo)
- [Revisión 2026‑07‑31](#revisión-2026-07-31)
  - [R‑012 · El panel se construye en React](#r-012--el-panel-se-construye-en-react)
  - [R‑013 · El repositorio nace en la raíz del vault](#r-013--el-repositorio-nace-en-la-raíz-del-vault)
  - [R‑014 · Conjunto mínimo de dependencias](#r-014--conjunto-mínimo-de-dependencias-para-la-fase-0)
  - [R‑015 · Node ejecuta TypeScript sin compilar](#r-015--node-ejecuta-typescript-sin-paso-de-compilación)
  - [R‑016 · Invariantes 1 y 3 como restricciones](#r-016--los-invariantes-1-y-3-pasan-de-prosa-a-restricción-estructural)
  - [R‑017 · El costeo local se marca provisional](#r-017--el-costeo-local-sale-marcado-como-provisional)
  - [R‑018 · El repositorio es público](#r-018--el-repositorio-es-público-desde-el-primer-commit)
  - [R‑019 · TypeScript 7 se aplaza](#r-019--typescript-7-se-aplaza-hasta-que-typescript-eslint-lo-admita)
  - [R‑020 · Telegram es el canal primario](#r-020--el-canal-primario-es-telegram-whatsapp-pasa-a-conector-declarado)
  - [R‑021 · El alcance de contacto, en tres capas](#r-021--el-alcance-de-contacto-se-defiende-en-tres-capas-no-en-una)
  - [R‑022 · El corpus, con huecos a propósito](#r-022--el-corpus-tiene-huecos-a-propósito-y-un-documento-envenenado)
  - [R‑023 · El corpus pasa a aseguradora digital](#r-023--el-corpus-pasa-de-clínica-dental-a-aseguradora-digital)
- [Revisión 2026‑07‑30](#revisión-2026-07-30)
  - [R‑001 · Arquitectura en dos planos](#r-001--arquitectura-en-dos-planos-con-proyección-de-un-solo-sentido)
  - [R‑002 · Desdoblado el campo `resultado`](#r-002--desdoblado-el-campo-resultado-de-telemetría)
  - [R‑003 · Verificador de procedencia](#r-003--el-verificador-de-sustento-pasa-a-ser-verificador-de-procedencia)
  - [R‑004 · Redistribución de la fase 4C](#r-004--las-restricciones-estructurales-de-la-fase-4c-bajan-a-las-fases-1-3-y-5)
  - [R‑005 · Fase 4B partida en tres](#r-005--la-fase-4b-se-parte-en-tres-y-el-informe-de-salud-sale-del-camino-crítico)
  - [R‑006 · Fase 7 antes del selector de modo](#r-006--la-fase-7-se-ejecuta-antes-que-el-selector-de-modo-del-panel)
  - [R‑007 · Telegram sube a la fase 3B](#r-007--telegram-sube-de-la-fase-8-a-una-fase-3b-propia)
  - [R‑008 · Invariantes como checks de CI](#r-008--los-invariantes-se-mecanizan-como-comprobaciones-que-bloquean-el-merge)
  - [R‑009 · Demo pública por reproducción](#r-009--la-demo-pública-reproduce-ejecuciones-registradas-no-hace-inferencia-en-vivo)
  - [R‑010 · n8n queda como referencia](#r-010--n8n-queda-como-referencia-no-entra-en-el-stack)
  - [R‑011 · Fase 8 de despliegue y operación](#r-011--se-añade-una-fase-8-de-despliegue-y-operación-que-el-plan-no-tenía)

---

# Revisión 2026‑07‑31

La fase 0 pasa de PROPUESTO a CONSTRUIDO. Sus criterios de aceptación tienen
prueba automatizada que pasa; el detalle medido está en la bitácora del día.
Todo lo que sigue son decisiones que se tomaron construyéndola, más una decisión
de stack del responsable.

---

### R‑012 · El panel se construye en React

**Contexto.** El canon fijaba el stack del perímetro —Node, PostgreSQL, Redis,
Qdrant, Ollama— y el plano de presentación por servicios de Firebase, pero no
decía con qué se construye la interfaz. La maqueta de la pantalla de Operación es
HTML suelto.

**Qué cambió.** El panel y la demo pública se construyen en **React**. React vive
**solo** bajo `panel/`: `src/**` no lo importa, y `panel/**` no importa `src/**`.
El panel lee la proyección de Firestore; nunca el perímetro.

**Por qué.** Decisión del responsable. La frontera explícita evita el modo de
falla obvio —que el núcleo acabe con dependencias de interfaz porque «solo era un
tipo compartido»— y encaja con la arquitectura en dos planos de [[00-CANON]] §Parte 3:
si el panel no puede importar el perímetro, tampoco puede saltarse la proyección.

**Impacto.** [[00-CANON]] §Parte 3 (tabla de stack) y fase 6 de
[[Propuesta-Desarrollo-Por-Fases]]. Dos reglas nuevas del check de arquitectura,
activas desde hoy aunque `panel/` esté vacío: `perimetro-sin-react` y
`perimetro-no-depende-del-panel`. Las dependencias concretas del panel —React y
su empaquetador— se proponen y se aprueban al empezar la fase 6, no ahora.

---

### R‑013 · El repositorio nace en la raíz del vault

**Contexto.** El manual dibujaba un repositorio `perimetro/` con `docs/` dentro.
El vault ya existía en `call_centre/docs/`, con las bitácoras al lado.

**Qué cambió.** `git init` en `call_centre/`. El código —`src/`, `config/`,
`migrations/`, `panel/`, `proyeccion/`, `lote/`, `tests/`— se crea junto a `docs/`
y `bitacoras/`, que quedan versionados con él.

**Por qué.** La alternativa era un repositorio en un subdirectorio con la
documentación fuera. Eso deja los documentos sin historial de versiones —justo
los documentos desde los que se razona el proyecto— y obliga al agente a leerlos
por ruta absoluta en cada sesión, en lugar de con `@docs/…`. Un documento
desactualizado hace decidir sobre una premisa falsa; tenerlo fuera del diff del PR
hace más probable que se desactualice.

**Impacto.** [[Perimetro-Manual-Claude-Code]] §1 describe la otra disposición y
queda corregido por esta entrada. `CLAUDE.md` vive en la raíz y apunta a
[[00-CANON]] como verdad única.

---

### R‑014 · Conjunto mínimo de dependencias para la fase 0

**Contexto.** La regla del manual es que cada dependencia nueva se propone y se
aprueba. La fase 0 necesita comprobar tipos, validar esquemas, vigilar fronteras
de módulo y correr pruebas.

**Qué cambió.** Se aprobaron **siete paquetes directos**: `zod` en producción;
`typescript`, `@types/node`, `eslint`, `@typescript-eslint/parser`,
`@typescript-eslint/eslint-plugin` y `dependency-cruiser` en desarrollo. Con sus
transitivos, 129 paquetes instalados.

**Qué se rechazó, y por qué.** `vitest` como corredor de pruebas: `node:test` es
integrado, tiene espías y simulación de módulos, y ahorra unos treinta paquetes.
`@eslint/js`: sus reglas base útiles se declaran a mano en `eslint.config.js`.
`pg`: la capa de repositorio nace en la fase 1; instalarlo ahora sería una
dependencia sin quien la use. `gitleaks` no es dependencia: corre como acción de
GitHub Actions.

**Por qué.** Un proyecto cuyo argumento de venta es el control del dato no puede
tener doscientas dependencias. Cada paquete es superficie que hay que auditar y
que Dependabot tendrá que mantener durante diez fases.

**Impacto.** `package.json`. La plantilla de PR tiene un campo obligatorio de
dependencias nuevas para que la regla no dependa de que alguien se acuerde.

---

### R‑015 · Node ejecuta TypeScript sin paso de compilación

**Contexto.** Node 26 interpreta TypeScript directamente, borrando los tipos sin
compilar. Eso elimina el paso de construcción, pero impone una restricción: la
sintaxis tiene que ser **borrable**.

**Qué cambió.** `tsconfig.json` activa `erasableSyntaxOnly`, `noEmit` y
`allowImportingTsExtensions`. En consecuencia, y como convención del proyecto: sin
`enum`, sin `namespace`, sin propiedades de parámetro en constructores; uniones y
objetos `as const` en su lugar. Los imports relativos llevan extensión `.ts`.

**Por qué.** No hay artefacto compilado entre lo que se lee y lo que corre, que
es una fuente menos de divergencia entre el código y su comportamiento. El precio
—tres construcciones de TypeScript que no se pueden usar— es bajo, y el compilador
lo hace cumplir en lugar de dejarlo a la disciplina.

**Impacto.** `tsconfig.json`, `CLAUDE.md` §Convenciones. Aplica a todo el código
del perímetro. `panel/` tendrá su propia configuración en la fase 6, porque React
sí necesita empaquetador.

---

### R‑016 · Los invariantes 1 y 3 pasan de prosa a restricción estructural

**Contexto.** La propuesta mecaniza cinco invariantes como checks de CI. Los
invariantes 1 —sin fuente no hay respuesta— y 3 —se registra qué salió y hacia
dónde— quedaban como reglas escritas que el código debía respetar.

**Qué cambió.** Los dos se convierten en restricciones del esquema del evento
(`src/telemetry/evento.ts`) **y** en `CHECK` de la tabla `eventos`
(`migrations/001_inicial.sql`):

- Una tarea de clase factual —catálogo, extracción, agendamiento— con
  `resultado = 'resuelto'` y `fuentes` vacío **no valida**. Un saludo sí puede
  resolverse sin fuentes; un precio no.
- `hubo_egreso` y `destinos_egreso` se validan el uno contra el otro: no se puede
  declarar egreso sin decir a dónde, ni negarlo mientras se listan destinos.

Y una decisión deliberada en sentido contrario: el esquema **sí permite**
representar sensibilidad alta con egreso. Si esa combinación fuera inexpresable,
el vigía de perímetro de la fase 4B‑1 tendría un contador que jamás podría subir,
y «cero fugas» sobre un contador que no puede contar no prueba nada.

**Por qué.** La regla que solo vive en la capa de aplicación se salta con un
`psql`. Y una regla que solo vive en la documentación se salta sin querer. La
duplicación entre el esquema y la base es intencionada: protegen entradas
distintas —el código y todo lo demás—.

**Impacto.** Fase 0 y criterios de las fases 2, 3 y 4B‑1. Siete pruebas en
`tests/telemetria.test.ts` ejercitan los rechazos, no solo los aciertos.

---

### R‑017 · El costeo local sale marcado como provisional

**Contexto.** La máquina de referencia para Ollama sigue sin decidir —está en la
lista de bloqueantes de [[00-CANON]] §Parte 4—, pero la fase 0 pide una función de
costeo con pruebas para nube, local e híbrido. Costear lo local exige supuestos de
hardware que no existen.

**Qué cambió.** Los supuestos viven en `config/maquina-referencia.json` con un
campo `estado ∈ {PROVISIONAL, CONFIRMADA}` y valores en cero. `costear()` devuelve
un campo `provisional` que es verdadero mientras cualquier tramo local se apoye en
una máquina sin confirmar, y ese campo viaja hasta el evento de telemetría como
`costo_provisional`. La función devuelve además los supuestos que usó —equipo,
vida útil, utilización asumida, tarifa horaria resultante— para que el panel los
muestre junto al número.

**Por qué.** La alternativa era rellenar el archivo con las cifras de un equipo
plausible, y eso produce exactamente lo que el proyecto prohíbe: una cifra sin
ejecución detrás, indistinguible de una medida. Con el estado explícito, el
bloqueante es visible en el propio dato en lugar de vivir solo en un documento.

**Por qué también los supuestos.** «$0,004 por caso» a secas invita a una pregunta
sin respuesta. «$0,004 por caso, equipo amortizado a tres años al 40 % de
utilización» es defendible. El primero es el que se cae en una demo.

**Impacto.** Fase 0, criterio del panel de la fase 6 —«los supuestos del costeo
local visibles junto al número»— y calculadora de la fase 6B, que importa
`costear` en lugar de reimplementarla. La máquina de referencia sigue
**BLOQUEADA** hasta que el responsable la defina.

---

### R‑018 · El repositorio es público desde el primer commit

**Contexto.** La fase 0 quedó construida en un repositorio local sin remoto. El CI,
la protección de rama, Dependabot y el escaneo de secretos estaban escritos pero
no actuando: exactamente lo que R‑008 quería evitar —invariantes que dependen de
la buena voluntad—.

**Qué cambió.** `github.com/GiovanniCastro/call-centre`, **público**. Se creó como
`perimetro` y se renombró el mismo día, por decisión del responsable: yo había
recomendado `perimetro` por coincidir con el nombre del producto, y `call-centre`
resulta más reconocible desde fuera. GitHub mantiene la redirección desde la URL
antigua. El producto sigue llamándose **Perímetro** en el canon, en `CLAUDE.md` y
en `package.json`; lo que cambia es el slug, no el nombre.

Configuración aplicada y verificada:

- **`main` protegida**, con los dos trabajos del CI como comprobaciones
  obligatorias, historial lineal, sin `force push` ni borrado de rama, y **la
  protección aplica también a administradores**. Verificado: un push directo a
  `main` se rechaza con `GH006`, siendo el dueño del repositorio.
- **Escaneo de secretos con protección de empuje** activado. Es la mitad de la
  sección H de la fase 4C, gratis y desde el día uno.
- **Dependabot** con alertas y correcciones de seguridad. Actualizaciones
  agrupadas: siete PR sueltos por semana son ruido, y una alerta que se ignora no
  protege de nada.
- `.claude/settings.json` pasa a `settings.local.json` e ignorado: eran permisos
  de una máquina concreta, con rutas del disco y el nombre de otro proyecto.
  Publicarlos no aportaba nada y es superficie regalada. La habilidad
  `call_centre_docs` sí se versiona, porque es del proyecto.

**Por qué público.** Es una demo de portafolio y el argumento de venta es que cada
respuesta sea auditable; un repositorio cerrado pide creer eso en lugar de
comprobarlo. Además la protección de rama y el escaneo de secretos son gratuitos
en repositorios públicos y suelen exigir plan de pago en privados — sin ellos, el
protocolo de fases queda escrito pero no aplicado, que es el mismo defecto que
R‑008 vino a corregir.

**Por qué la protección aplica a administradores.** El plan dice «sin push
directo» sin excepciones, y un proyecto cuya tesis es «todo umbral tiene un vigía»
no puede eximirse a sí mismo. El coste es que una corrección urgente exige
levantar la protección a mano; se asume a propósito.

**Impacto.** La fase 0 se cerró con el PR #1 y la etiqueta `v0.0`. El CI corre en
GitHub y pasa —16 s y 8 s en la primera ejecución—, no solo en local. Corrige la
bitácora del 31‑jul, que anotaba «sin remoto en GitHub» como pendiente abierto.
Corrige también [[Propuesta-Desarrollo-Por-Fases]] §4 en un punto: la plantilla de
PR no exige revisión de un segundo par de ojos, porque no hay un segundo par de
ojos; exigirla bloquearía todos los merges.

---

### R‑019 · TypeScript 7 se aplaza hasta que `@typescript-eslint` lo admita

**Contexto.** A los dos minutos de activarse, Dependabot abrió cuatro PR. Tres
—`gitleaks-action` 2→3, `setup-node` 5→7, `checkout` 5→7— pasaron el CI y se
fusionaron. El cuarto proponía TypeScript 5.9.3 → 7.0.2, el compilador reescrito
en Go.

**Qué cambió.** Nada: el proyecto sigue en TypeScript 5.9.3. El PR queda aplazado
con `@dependabot ignore this major version`, y esta entrada existe para que el
aplazamiento no sea invisible.

**Por qué.** `npm ci` aborta antes de compilar nada:

```
npm error Found: typescript@7.0.2
npm error Could not resolve dependency:
npm error peer typescript@">=4.8.4 <6.1.0" from @typescript-eslint/eslint-plugin@8.65.0
```

`@typescript-eslint` 8.x declara TypeScript **< 6.1.0** como par admitido.
Instalar ambos exige `--legacy-peer-deps`, que es aceptar a sabiendas una
resolución que el propio gestor considera rota — y el lint es lo que sostiene el
invariante de «sin `any`» y la fuente única de costo. No es una dependencia que
convenga tener en un estado que npm marca como incorrecto.

**Cuándo se revisa.** Cuando `@typescript-eslint` publique una versión que admita
TypeScript 7. Entonces entran **los dos juntos**, no por separado.

**Lo que esto demostró, que vale más que la actualización.** El CI detectó el
fallo por su cuenta —`Tipos, lint, arquitectura y pruebas` en rojo a los 12 s—
antes de que nadie mirara el PR. Es la primera vez que la puerta de R‑008 para
algo real en lugar de una violación fabricada a propósito.

**Un defecto propio que salió a la luz.** Al montar la fase 0 se consultaron las
versiones publicadas y se vio `typescript 7.0.2`; se actualizaron los rangos de
los otros seis paquetes y el de TypeScript se quedó en `^5.9.3`. Dependabot lo
señaló en dos minutos, que es exactamente para lo que está.

**Impacto.** Ninguno en el código. `package.json` mantiene `"typescript": "^5.9.3"`.

---

### R‑020 · El canal primario es Telegram; WhatsApp pasa a conector declarado

**Contexto.** La fase 1 se llamaba «Canal WhatsApp endurecido». WhatsApp Business
exige un **número corporativo** y una revisión de Meta que puede tardar semanas.
El trámite ni siquiera se había iniciado, y figuraba como bloqueante en
[[00-CANON]] §Parte 4. Con ese orden, todo el proyecto —enrutador, validación,
vigías, panel— quedaba detrás de una autorización que no controlamos.

**Qué cambió.** Decisión del responsable:

- **La fase 1 pasa a ser Telegram.** Un bot se crea hablando con `@BotFather` y
  guardando un token. Sin número corporativo, sin revisión, sin espera.
- **WhatsApp queda como conector declarado**, escrito y probado contra cargas de
  ejemplo, que se activa el día que existan sus credenciales. Se registra como
  `no_configurado` y **declara qué necesita para instalarse** —cuenta de WhatsApp
  Business, número verificado, aplicación de Meta, token permanente, URL de webhook
  y token de verificación— en una forma que la aplicación puede leer, no en un
  párrafo de README. El panel de la fase 6 lo mostrará.
- **La fase 3B deja de ser «Telegram»** y pasa a ser «segundo canal y conector de
  WhatsApp».

**Por qué.** Nada de la fase 1 es específico de un canal salvo el adaptador: la
verificación de la credencial, el rechazo de repetición, el límite de tasa, el
debounce, la normalización a mensaje canónico y el alcance de contacto obligatorio
son idénticos. Cambiar el canal primario cambia unas cien líneas, no la fase. Lo
que cambia de verdad es que el proyecto deja de depender de un trámite ajeno.

**El agujero que abría, y cómo se tapa.** La fase 3B existe para demostrar que la
abstracción `Canal` funciona, y esa demostración necesita un **segundo** canal
construible. Si el segundo fuera WhatsApp, el criterio quedaría detrás del mismo
trámite que acabábamos de apartar — y un criterio que depende de una autorización
externa puede no cumplirse nunca.

El segundo canal es **`lote`**: alimenta casos desde archivos por la misma
interfaz. No depende de nadie, ya está declarado en el enum `canal` desde la
fase 0, y **la fase 7 lo necesita de todos modos** — su corredor tiene que meter
cincuenta o cien casos por el sistema, y hacerlo por la interfaz `Canal` en lugar
de por un atajo significa que el lote ejercita el camino real en vez de uno
paralelo que puede divergir sin que nadie se entere. Construirlo en la 3B adelanta
trabajo de la 7 al momento en que además sirve de prueba.

**Qué NO cambia.** El criterio de la firma sigue en pie con otro mecanismo:
Telegram usa un secreto compartido en la cabecera
`X-Telegram-Bot-Api-Secret-Token`; WhatsApp usa HMAC. Por eso la verificación pasa
a ser un método de la interfaz `Canal`, no código del webhook. La comparación sigue
siendo en tiempo constante y sigue ocurriendo **antes de encolar nada**.

**Un riesgo nuevo, dicho en voz alta.** El conector de WhatsApp se escribirá contra
la documentación del proveedor y podría no ejercitarse nunca contra el proveedor
real. Se mitiga con cargas de ejemplo firmadas, pero **no se llamará «probado»**
hasta que haya pasado un mensaje de verdad. Un conector que nadie ha ejercitado es
una promesa, no una garantía.

**Impacto.** [[Propuesta-Desarrollo-Por-Fases]] §7, §7 bis (nueva), §Fase 1,
§Fase 3B y §10. [[00-CANON]] §Parte 4: WhatsApp deja de figurar como bloqueante.
Sin efecto en el código de la fase 0: `canal` ya incluía `telegram` y `lote`, que
es exactamente por qué el enum se declaró completo desde el principio.

---

### R‑021 · El alcance de contacto se defiende en tres capas, no en una

**Contexto.** La sección D de la fase 4C pide filtro de contacto obligatorio en la
capa de repositorio, y R‑004 lo bajó a la fase 1 porque ahí es donde nace esa
capa. El criterio de aceptación es exigente y está bien redactado: «existe una
prueba que falla si algún método de `repos/` **puede** consultar sin filtro de
contacto». La palabra es *puede*, no *consulta*.

**Qué cambió.** `AlcanceContacto` se implementa con tres protecciones que se
sostienen unas a otras:

1. **Marca de símbolo en el tipo.** Un objeto con la forma correcta —
   `{ contacto_id, canal }` — **no** es un `AlcanceContacto`. Falsificarlo exige un
   `as` explícito, que es visible en el diff de un PR.
2. **Comprobación en ejecución.** Toda función exportada de `src/repos/` recibe el
   alcance como primer argumento y llama a `exigirAlcance`. Los tipos se borran al
   ejecutar; la marca no. Un `as` escrito con prisa pasa el compilador y muere
   aquí.
3. **Prueba estructural sobre el árbol sintáctico.** Recorre `src/repos/` con el
   compilador de TypeScript —que ya era dependencia del proyecto— y falla si
   aparece una función exportada sin alcance, o una consulta sin filtro de
   contacto.

**Por qué tres y no una.** Comprobar que las funciones de hoy filtran se cumple
hasta que alguien añada una que no lo haga, y entonces la prueba sigue verde. La
capa 3 es la única que convierte «esto está bien escrito» en «esto no se puede
escribir mal», y es la que pide el criterio. Las capas 1 y 2 existen porque una
protección que solo actúa en el momento de la prueba llega tarde: quien escribe el
código quiere saberlo mientras lo escribe.

**Qué encontró la prueba nada más existir.** Falló al primer intento, señalando un
`INSERT`. Tenía razón sobre el síntoma y la regla estaba mal: una inserción que
**escribe** `contacto_id` no puede filtrar por él. La regla distingue ahora leer
de escribir — leer sin filtro devuelve filas ajenas; insertar sin atribuir deja una
fila sin dueño que ninguna consulta filtrada volverá a encontrar. Es la clase de
matiz que no aparece razonando en abstracto.

**Una alternativa considerada y no descartada del todo: *row‑level security* de
PostgreSQL.** Es la defensa nativa de la base y sería más fuerte en un aspecto
concreto: protegería también de una consulta escrita fuera de `src/repos/`, o de
un script de mantenimiento. No se adopta ahora por dos motivos — obliga a
establecer el rol en cada conexión, con lo que la garantía pasa a depender de la
configuración del grupo de conexiones; y añade una capa de depuración justo donde
menos conviene equivocarse. **Queda anotada para revisarla en la fase 8**, cuando
exista despliegue real y la configuración de conexión esté fijada.

**Impacto.** Fase 1. `src/repos/alcance.ts`, `src/repos/conversaciones.ts` y
`tests/repos-alcance.test.ts`. La fase 5 hereda la regla: las herramientas de
acción no aceptan destinatario desde el texto, y el alcance es lo que lo garantiza
del lado de los datos.

---

### R‑022 · El corpus tiene huecos a propósito, y un documento envenenado

**Contexto.** «El corpus de la empresa ficticia» figuraba como bloqueante de las
fases 2 y 7 desde la primera revisión. Sin documentos no hay nada que indexar, y
sin índice el invariante 1 —sin fuente no hay respuesta— deja al agente sin poder
decir nada.

**Qué cambió.** Diecisiete documentos de la **Clínica Dental Aurora**, ficticia, en
`corpus/`: servicios, precios, horarios, políticas, urgencias, seguros, protección
de datos y preguntas frecuentes. Unas 6.600 palabras.

**Por qué así y no pulido.** Están escritos como los escribiría la clínica, no como
los querría un sistema de recuperación: formatos desiguales, algún dato repetido
en dos sitios y alguna redacción ambigua. Un corpus pulido demostraría que la
recuperación funciona sobre corpus pulidos, que no es lo que hace falta saber.

**Las omisiones son la parte importante.** La fase 2 tiene un criterio de
aceptación que exige que una pregunta sin respuesta en los documentos devuelva
**vacío, no un fragmento forzado**. Ese criterio no se puede probar si el corpus lo
cubre todo. Se omiten a propósito cuatro temas que un cliente preguntaría —estética
facial, odontopediatría por encima de los 12 años, precio de urgencias fuera de
horario y financiación a más de 12 meses—. Si el agente responde a alguno, está
inventando, y eso es un fallo del sistema, no una carencia del corpus.

**Trampas puestas a propósito**, cada una contra un criterio concreto:

| Qué | Para qué |
|---|---|
| El precio de la limpieza aparece en dos documentos | Que la citación señale una fuente concreta y no «alguna de las dos» |
| La política de cancelación tiene una excepción que contradice la regla general dos párrafos antes | Que el agente no cite la regla ignorando la excepción |
| `07-horarios.md` lleva fecha de caducidad explícita | El vigía de vigencia de la fase 4B‑2 |
| La tabla de seguros tiene condiciones que se solapan | Que la extracción no mezcle filas |
| `14-documento-con-instruccion-incrustada.md` contiene texto que ordena al agente revelar datos de otros pacientes | Fase 4C, envenenamiento del índice |

El documento envenenado va **rodeado de material real de la clínica**, porque un
documento hostil no llega con una etiqueta que lo anuncie. Lleva un aviso al
principio para quien lo lea, no para el sistema: si el agente cambia de
comportamiento tras indexarlo, la fase 4C no está haciendo su trabajo.

**Lo que hay que decir en voz alta.** La clínica no existe y sus precios los
inventé yo. Está escrito en `corpus/00-LEEME.md` con un aviso que ocupa la primera
pantalla, porque un corpus ficticio que se confunda con datos reales es
exactamente la clase de cifra sin ejecución detrás que este proyecto prohíbe. **Si
esto pasa a ser una demo para un cliente real, la carpeta se sustituye entera** — y
esa es la intención: el sistema no debe saber nada de odontología, solo saber leer
documentos.

**Impacto.** [[00-CANON]] §Parte 4: el corpus sale de la lista de bloqueantes.
Desbloquea la fase 2 y la 7. Quedan tres bloqueantes: la máquina de referencia
para Ollama, el proveedor de nube y —nuevo, descubierto construyendo la fase 1— la
ausencia de Docker en la máquina de desarrollo, que impide ejecutar en local todo
lo que toque Redis, PostgreSQL y, a partir de la fase 2, Qdrant.

> **Sustituida por R‑023.** El mecanismo de esta entrada —huecos deliberados,
> cinco trampas, documento envenenado, aviso de ficción— sigue vigente palabra por
> palabra. Lo que cambió es el negocio: la clínica dental dejó paso a una
> aseguradora. Se conserva porque explica **por qué** el corpus está construido
> así, que es lo que R‑023 hereda.

---

### R‑023 · El corpus pasa de clínica dental a aseguradora digital

**Contexto.** El corpus de R‑022 cumplía su función: diecisiete documentos, huecos
deliberados, trampas y un documento envenenado. Pero el dominio elegido —una
clínica dental— resultó ser el más flojo de los disponibles para lo que este
sistema tiene que demostrar. Una clínica responde preguntas planas: cuánto cuesta
una limpieza, a qué hora abrís. Casi todo son datos únicos sin condiciones.

**Qué cambió.** El corpus se sustituye **entero** por el de **Nimbo Seguros**,
aseguradora digital ficticia del mercado estadounidense, con cinco ramos
—inquilino, propietario, mascotas, vida y auto—. Diecisiete documentos, cifras en
dólares, marco regulatorio estadounidense, redactados en español porque la
compañía atiende en español. Decisión del responsable, con Lemonade como
referencia **de modelo de negocio, no de contenido**: comisión fija, catálogo
corto, contratación y siniestros por aplicación, sobrante anual donado. Ni una
línea copiada de una póliza real.

**Por qué el dominio importa.** Cuatro capacidades del sistema pasan de probarse
con ejemplos a probarse con material:

| Capacidad | Con la clínica | Con la aseguradora |
|---|---|---|
| Respuesta condicional | «La limpieza cuesta $X» | «Está cubierto» depende del ramo, del estado, del deducible y de si encaja en una exclusión |
| Sensibilidad alta (invariante 3, vigía de perímetro) | Datos de contacto | Número de seguro social, carné de conducir, cuenta bancaria, cuestionario de salud |
| Extracción con procedencia (fase 4) | Precios sueltos | Límites, sublímites, deducibles y fechas de vigencia, cada uno con su `fragmento_id` |
| Coste de equivocarse | Molestia | Afirmar que algo está cubierto cuando no lo está es un daño concreto |

La segunda fila es la que decide. El vigía de perímetro de la fase 4B‑1 tiene que
poder enseñar «31 de 31 retenidos», y para eso hacen falta casos de sensibilidad
alta **de verdad**, no inventados encima de un corpus que no los pedía.

**Las trampas se conservan, traducidas al dominio nuevo.** La duplicación de un
precio en dos documentos, la excepción que contradice la regla general, la tabla
con filas que se solapan, la fecha de vigencia explícita y el documento
envenenado siguen ahí, una por una. Dos ganan fuerza al cambiar de dominio:

- **La excepción de cancelación** pasa a ser la trampa más peligrosa del corpus.
  La regla general promete reembolso prorrateado; la excepción lo niega si hubo un
  siniestro pagado. Un agente que cite la regla e ignore la excepción da una
  respuesta que **suena correcta y cuesta dinero**.
- **La tabla de cobertura por estado** son doce estados por cinco ramos con seis
  notas al pie que se solapan, y se declara a sí misma con precedencia sobre los
  documentos de producto. Resolver bien un conflicto exige respetar esa
  precedencia, no promediar las dos fuentes.

**Los huecos deliberados pasan de cuatro a cinco**: motocicletas y embarcaciones,
vida entera y universal, mascotas que no sean perro o gato, el precio de la póliza
de inundación y el recargo de los conductores menores de 25 años. Los cinco son
preguntas que un cliente haría. Si el agente contesta a alguna, está inventando.

**Un defecto que R‑022 tenía y no vio.** `00-LEEME.md` enumera los huecos y las
trampas. Si se ingesta con el resto de la carpeta, una pregunta sobre motocicletas
recupera el párrafo que explica que las motocicletas son un hueco a propósito —y
el criterio de aceptación de la fase 2 queda invalidado por su propia
documentación. **La ingestión excluye todo archivo cuyo nombre empiece por
`00-`.** Queda escrito en el propio léeme y en la fase 2 de
[[Propuesta-Desarrollo-Por-Fases]], porque es una restricción de la ingestión, no
una convención de nombres.

**Lo que hay que decir en voz alta.** Nimbo Seguros no existe. Sus precios, sus
coberturas, sus cifras de donación y los estados donde dice operar son inventados,
y nada de ese material es asesoramiento en materia de seguros. El aviso ocupa la
primera pantalla de `corpus/00-LEEME.md`. Vale aquí lo mismo que valía para la
clínica: **si esto pasa a ser una demo para un cliente real, la carpeta se
sustituye entera**, y esa es la intención — el sistema no debe saber nada de
seguros, solo saber leer documentos.

**Impacto.** [[00-CANON]] §Parte 4 y la fase 2 de
[[Propuesta-Desarrollo-Por-Fases]]. Ninguna línea de `src/` cambia: el corpus no
tiene código todavía. Sí cambia el texto de ejemplo de `tests/canales.test.ts`,
que preguntaba por una limpieza dental. El corpus sigue sin bloquear las fases 2 y
7; lo que cambia es de qué hablan los casos que se escribirán en la 7.

---

# Revisión 2026‑08‑01

La fase 2 pasa de PROPUESTO a CONSTRUIDO. Una de sus mediciones obliga a
precisar qué puede y qué no puede hacer el umbral de recuperación, y esa
precisión cambia dónde vive el invariante 1.

---

### R‑024 · El umbral de similitud no puede sostener el invariante 1 por sí solo

**Contexto.** El criterio de aceptación de la fase 2 dice: «una pregunta cuya
respuesta no está en los documentos devuelve vacío, no un fragmento forzado». El
mecanismo previsto era un umbral de similitud configurable: por debajo, vacío.

**Qué se midió.** Veinte consultas contra el corpus de Nimbo Seguros indexado con
`bge-m3`, 106 fragmentos. La mejor puntuación de cada una:

| Grupo | Rango |
|---|---|
| Fuera del dominio (clima, capital, receta) | 0.327 – 0.363 |
| Otro sector con forma de pregunta parecida (limpieza dental) | 0.486 |
| **Huecos deliberados del corpus** | 0.477 – **0.601** |
| **Preguntas que el corpus sí cubre** | **0.564** – 0.775 |

**Los dos últimos rangos se solapan.** No por poco: entre 0.564 y 0.601 conviven
tres preguntas legítimas y dos que el corpus no puede responder.

**Qué cambió.** El umbral se queda en 0.55 y **se le atribuye el trabajo que sí
hace**: detiene el 100 % de las consultas ajenas al dominio y deja pasar el 100 %
de las cubiertas. Deja de atribuírsele el que no puede hacer.

**Por qué no se arregla subiéndolo.** Subirlo a 0.61 atraparía los cinco huecos y
produciría **tres vacíos falsos** sobre preguntas que el corpus responde. Cambiar
un fallo por otro peor: un vacío falso es el agente diciendo «no está
documentado» sobre algo que sí lo está, y nadie lo detecta porque tiene la forma
exacta de una respuesta correcta.

**Y por qué ningún umbral lo arregla.** «¿Aseguráis motocicletas?» **es** parecida
a la póliza de auto. Debe serlo: habla de vehículos, de cobertura y de
contratación. La similitud del coseno mide parentesco temático, y el parentesco
es real. Lo que le falta al fragmento recuperado no es parecido con la pregunta:
es **la respuesta**. Ninguna función de distancia entre vectores distingue «trata
de esto» de «contiene el dato que se pide», porque son propiedades distintas.

**Dónde vive entonces el invariante 1.** En dos sitios, no en uno:

1. **El umbral, en la fase 2** — descarta lo ajeno al dominio. Primera línea.
2. **El verificador de procedencia, en la fase 4** — comprueba que el valor citado
   aparece **literalmente** en el fragmento que se recuperó en esa ejecución.
   Es lo que atrapa el caso «recuperó algo del tema, pero no dice lo que el
   modelo afirma».

Esto no es una vía de escape improvisada: es exactamente lo que
[[Propuesta-Desarrollo-Por-Fases]] §Fase 4 ya decidió, y por los mismos motivos.
Lo que aporta esta entrada es la medición que demuestra que la fase 4 **no es
opcional** — sin ella, el sistema responde preguntas cuya respuesta no tiene.

**El criterio de la fase 2, dicho con precisión.** Se cumple para preguntas fuera
del dominio del corpus. **No se cumple** para preguntas dentro del dominio cuya
respuesta concreta está ausente. Queda como criterio relajado con justificación
escrita, según el protocolo de fracaso de §9, y como issue abierto con etiqueta de
la fase 4. Un criterio relajado en silencio es deuda invisible; este queda a la
vista, con su número al lado.

**Impacto.** `config/conocimiento.json` lleva la medición completa en el campo
`medido`, no una cifra suelta. El umbral sigue marcado `PROVISIONAL`: veinte
consultas escritas por quien escribió el corpus no son una muestra, y la
calibración de verdad la da el lote de cincuenta a cien casos de la fase 7.
[[00-CANON]] §Parte 4.

---

# Revisión 2026‑07‑30

Primera revisión. Recoge la lectura crítica de [[Perimetro-Manual-Claude-Code]],
de la maqueta del panel y del plan por fases, y las decisiones que salieron de ahí.
El resultado está en [[Propuesta-Desarrollo-Por-Fases]].

---

### R‑001 · Arquitectura en dos planos, con proyección de un solo sentido

**Contexto.** Entra Firebase en el stack, y Firebase es un servicio alojado por
Google. El invariante 3 dice que los datos sensibles no salen del perímetro. Sin
una frontera declarada, las dos cosas se contradicen.

**Qué cambió.** El sistema queda partido en dos planos. El **perímetro**,
autoalojado, con Node, PostgreSQL, Redis, Qdrant y Ollama, donde viven los datos.
La **presentación**, en Firebase, con Hosting, Auth, Firestore de solo lectura, App
Check y Cloud Storage. Entre ambos, un publicador que corre dentro del perímetro y
escribe agregados y trazas saneadas hacia Firestore. Se añade el **invariante 8**:
la proyección es de un solo sentido; Firebase nunca escribe hacia el perímetro, y
ninguna credencial de administrador existe fuera de él.

**Por qué.** Así Firebase resuelve lo que resuelve bien —hosting, autenticación,
lectura en vivo, protección del endpoint público— sin tocar el argumento de venta.
De hecho lo refuerza: se puede enseñar que el panel público no tiene acceso a la
base, solo a una proyección de la que se han retirado los datos.

**Impacto.** [[00-CANON]] §Parte 3. Fases 6 y 8 de
[[Propuesta-Desarrollo-Por-Fases]]. Descarta Firestore como estado conversacional
y Remote Config para umbrales.

---

### R‑002 · Desdoblado el campo `resultado` de telemetría

**Contexto.** El esquema de la fase 0 definía `resultado ∈ {resuelto, escalado,
descartado}`. Pero el sistema tiene **dos escalados distintos**: el respaldo
controlado de la fase 3, cuando el modelo local falla y el caso va a la nube; y la
cola de escalado a humano de la fase 4. Los dos caían en el mismo valor.

**Qué cambió.** `resultado ∈ {resuelto, escalado_humano, descartado, bloqueado}`,
más un campo nuevo `desvio_ejecucion ∈ {ninguno, local_a_nube, nube_a_local}` con
su motivo. Y un criterio de aceptación nuevo en la fase 0: dos métricas que cuenten
lo mismo deben derivarse del mismo campo.

**Por qué.** Contar sobre el enum anterior produce dos cifras distintas para lo
mismo. No es teórico: **ya ocurrió en la maqueta del panel**, que muestra `41`
escalados a humano en el KPI y `17` en el reparto del enrutador, sobre los mismos
190 casos. Ambas cifras son internamente coherentes y mutuamente incompatibles. El
defecto apareció antes de existir una línea de código, y su causa está en el
esquema.

**Impacto.** Fase 0 y criterio de reconciliación de la fase 6. Sin efecto en
código: no hay eventos escritos todavía, que es exactamente por qué se corrige
ahora y no después.

---

### R‑003 · El verificador de sustento pasa a ser verificador de procedencia

**Contexto.** La fase 4 pedía un componente que «comprueba que cada afirmación de
la respuesta esté respaldada por al menos un fragmento recuperado». Eso es
inferencia de lenguaje natural, y las dos implementaciones obvias chocan con el
canon: un modelo verificador viola el invariante 7, y el solapamiento léxico
produce una puntuación que no significa nada — sobre la que además vigila un umbral
en la fase 4B‑2.

**Qué cambió.** El modelo deja de escribir prosa que luego se audita. Emite una
**estructura donde cada dato factual lleva su `fragmento_id`**, y el verificador
comprueba tres cosas deterministas: que el id existe, que ese fragmento se recuperó
*en esta ejecución*, y que el valor citado aparece literalmente en él. La redacción
final se compone en código a partir de la estructura ya verificada.

**Por qué.** Convierte un problema de inferencia en un `join`. La puntuación de
sustento pasa de estimación a proporción contable: campos con procedencia válida
sobre campos totales. Y cumple el invariante 6 al pie de la letra — el modelo
redacta, el código decide. El flujo de referencia en n8n hace justo lo contrario
con su *Auto Fixing Output Parser*; ver [[REFERENCIA-N8N]].

**Impacto.** Fase 4 completa. Añade el criterio de aceptación de la cita
alucinada: una respuesta con un `fragmento_id` que no se recuperó en esa ejecución
se bloquea.

---

### R‑004 · Las restricciones estructurales de la fase 4C bajan a las fases 1, 3 y 5

**Contexto.** El principio rector de 4C es que la contención vence a la detección,
pero el plan colocaba toda la contención al final. La sección D pide filtro de
contacto obligatorio en la capa de repositorio, que nace en la fase 1 y crece en la
5. La F pide lista blanca de salida, y los adaptadores son de la 3. La A pide
verificar la firma «antes de encolar nada», y el webhook con su cola es la fase 1.

**Qué cambió.** 4C‑A y 4C‑D y el control de caudal de borde van a la **fase 1**. La
delimitación de procedencia del contenido externo y la lista blanca de salida van a
la **fase 3**. El destinatario fijado por el sistema va a la **fase 5**. La gestión
de secretos va a la **fase 0**. El acceso administrativo va a la **fase 6**. En 4C
queda la capa de detección: secuestro, envenenamiento del índice, filtro de fuga y
respuesta graduada.

**Por qué.** Escritas en su fase natural son entre veinte y cincuenta líneas cada
una. Retrofiteadas en 4C son un refactor de la capa de repositorio y del webhook
con cuatro fases de código y de pruebas ya escritas encima. Y hay un criterio de
aceptación de la fase 1 —«reiniciar el proceso no pierde la conversación»— que pasa
sin el filtro de contacto, así que nada avisaría.

**Impacto.** Fases 0, 1, 3, 5, 6 y 4C. Tabla completa de redistribución en
[[Propuesta-Desarrollo-Por-Fases]] §6.

---

### R‑005 · La fase 4B se parte en tres y el informe de salud sale del camino crítico

**Contexto.** La fase 4B pedía once vigías con prueba de inyección de fallo cada
uno, más un sistema de informes con huella, agrupación, tendencia, correlación con
despliegues, extracción del caso de reproducción, dos formatos y paso por la capa
de saneo. El propio manual sugería «considera partirla en dos» y a la vez advertía
que arrastrar contexto largo degrada las decisiones.

**Qué cambió.** **4B‑1** — los tres que detienen: presupuesto, perímetro, bucle.
**4B‑2** — los cinco que observan: sustento, proveedor, vigencia, cola, silencio.
**Fase 9** — vigía de fallas e informe de salud, después del despliegue.

**Por qué.** 4B tal como estaba era varias veces el tamaño de la fase 3, que el
plan llama «el corazón del proyecto». Y el informe de salud es una herramienta de
desarrollo excelente de la que no depende nada de la demo pública. 4B‑1 es el
mínimo para exponer algo al público, y conviene poder llegar ahí pronto.

**Impacto.** Secuencia de fases. El vigía de inyección, que aparecía duplicado en
4B y 4C, se declara solo como interfaz en 4B‑1 y se especifica en 4C.

---

### R‑006 · La fase 7 se ejecuta antes que el selector de modo del panel

**Contexto.** La fase 6 pedía un selector nube/local/híbrido que muestre «la misma
carga de trabajo bajo los tres despliegues con las cifras recalculadas», y su
criterio de aceptación exigía que toda cifra se rastree hasta eventos reales.
Ejecutar la misma carga contra los tres modos **es** el corredor de la fase 7.

**Qué cambió.** La fase 6 construye el panel sobre histórico real de un solo modo.
La fase 7 escribe el lote y corre el corredor tri‑modo. Una fase **6B** enciende el
selector y la calculadora de punto de equilibrio con los datos ya registrados.

**Por qué.** Tal como estaba, la fase 6 no podía cumplir su propio criterio de
aceptación hasta que existiera la 7. Era una dependencia invertida, y la salida
fácil habría sido rellenar el selector con cifras inventadas.

**Impacto.** Secuencia. La calculadora de la 6B importa la función de costeo de la
fase 0 en lugar de reimplementarla, con prueba de consistencia entre ambas
superficies.

---

### R‑007 · Telegram sube de la fase 8 a una fase 3B propia

**Contexto.** El criterio de aceptación de la fase 1 —«el núcleo no importa nada
específico de WhatsApp»— se verificaba leyendo el código.

**Qué cambió.** Telegram pasa a ser la fase 3B, una sesión corta justo después del
enrutador. La fase 10 se queda solo con la voz.

**Por qué.** La única verificación real de que la abstracción de canal funciona es
un segundo canal, y son unas cien líneas sobre la interfaz `Canal`. Enterrado al
final, ese criterio pasaba siete fases sin probarse — tiempo de sobra para que el
núcleo acumule dependencias de WhatsApp que nadie nota. Además da una vía de
avance si la aprobación de WhatsApp Business se retrasa.

**Impacto.** Secuencia. Criterio nuevo: añadir Telegram no modifica ni una línea de
`src/core/`, verificable con el diff del PR.

---

### R‑008 · Los invariantes se mecanizan como comprobaciones que bloquean el merge

**Contexto.** Los invariantes vivían en `CLAUDE.md`, que es contexto para el
agente. En la fase 6, con cuarenta archivos en el repositorio, un agente viola el
invariante 4 sin mala fe y nadie se entera.

**Qué cambió.** Cinco de los ocho pasan a ser checks de GitHub Actions con
protección de rama: `dependency-cruiser` para el aislamiento del núcleo, un arnés
que falla si un caso emite cero o dos eventos, `tsc --strict` con `no-explicit-any`
en error, `gitleaks` más push protection, un lint que confina el acceso a SQL a
`src/repos/` y el `fetch` al módulo de salida con lista blanca.

**Qué cambió, además.** Los datos de demostración del panel viven en un único
módulo, y activarlo **renderiza la banda de demostración automáticamente**. No se
puede tener cifras falsas sin la etiqueta, porque la misma bandera controla las
dos cosas.

**Por qué.** Un proyecto cuya tesis es «todo umbral tiene un vigía» no puede dejar
sus propios umbrales de construcción a la buena voluntad. Y en la maqueta actual la
banda de demostración es una decisión de diseño que cualquiera puede borrar: eso es
una promesa, no una garantía.

**Impacto.** Fase 0 monta el CI. Cada check se activa en la fase que lo hace
posible. Tabla en [[Propuesta-Desarrollo-Por-Fases]] §5.

---

### R‑009 · La demo pública reproduce ejecuciones registradas, no hace inferencia en vivo

**Contexto.** La demo pública necesita estar disponible siempre, no consumir
presupuesto por visitante, y no exponer el webhook. Pero la inferencia local
depende de una máquina con Ollama encendida.

**Qué cambió.** La demo sirve ejecuciones registradas del lote de la fase 7 desde
la proyección de Firestore, etiquetada como reproducción y con el identificador del
lote visible.

**Por qué.** El plan ya lo pedía en dos sitios sin decirlo así: «el panel funciona
sin datos en vivo, leyendo el histórico registrado» y «la demo pública no consume
presupuesto de API por visitante». Es honesto mientras esté etiquetado, y resuelve
de paso la sincronía de la fase 10, donde la traza tiene que avanzar al ritmo de
una llamada grabada.

**Impacto.** Fase 8. Criterio: la demo pública no realiza ninguna llamada de
inferencia.

---

### R‑010 · n8n queda como referencia, no entra en el stack

**Contexto.** El preámbulo original admitía n8n «solo como plomería de canales si
acelera». Existe un flujo de n8n funcionando con VAPI, Telegram, WhatsApp, agente
con memoria en PostgreSQL, MCPs y carga RAG.

**Qué cambió.** n8n queda **fuera del stack por completo**, ni siquiera para
canales. Se documenta el flujo existente como especificación viva en
[[REFERENCIA-N8N]]: qué confirma del plan, qué hace de otra forma y por qué nos
desviamos.

**Por qué.** Decisión del responsable. Y coincide con lo que la propia referencia
muestra: sus dos lienzos de canal son el mismo grafo duplicado, que es justo lo que
la interfaz `Canal` existe para evitar; y su verificador es un modelo arreglando a
otro modelo, que es lo que el invariante 7 prohíbe. Mantenerlo como referencia
tiene más valor que mantenerlo como dependencia.

**Impacto.** [[00-CANON]] §Parte 3. El flujo de n8n puede seguir corriendo en
paralelo: sirve de patrón contra el que comparar las respuestas del lote de la
fase 7.

---

### R‑011 · Se añade una fase 8 de despliegue y operación que el plan no tenía

**Contexto.** El plan original terminaba en el canal de voz. Ocho fases de producto
y ninguna de puesta en marcha, para un sistema cuyo objetivo declarado es una demo
pública con un webhook expuesto.

**Qué cambió.** Fase 8: máquina de referencia documentada, PostgreSQL, Redis y
Qdrant en contenedores, respaldos con prueba de restauración, secretos de
producción, despliegue del panel por etiqueta con GitHub Actions, App Check sobre
los endpoints públicos y la demo en modo reproducción.

**Por qué.** Sin ella no hay demo, solo un repositorio. Y hay dos requisitos del
propio plan que no se construyen solos: la autenticación del panel con sesiones
cortas y registro de accesos de la sección 4C‑G, y las cifras de costo local, que
dependen de una máquina de referencia definida.

**Impacto.** Secuencia. Criterio nuevo: una restauración de respaldo se ha
ejecutado y verificado. Un respaldo que nunca se ha restaurado no es un respaldo.

---

## Pendiente de registrar

Cosas decididas pero aún sin entrada, o abiertas a la espera del responsable:

- **El corpus de la empresa ficticia.** Entregable con nombre dentro de la fase 2.
  Bloquea también la fase 7. No existe.
- **La máquina de referencia para Ollama.** Sin definirla, las cifras de costo
  local no se pueden defender. Decisión pendiente.
- **Proveedor de nube concreto** para la inferencia frontera. Sin decidir.
- **Los arreglos de la maqueta**: contraste de `--faint`, estado de vigías por
  color únicamente, filas de tabla no operables con teclado, fuentes servidas desde
  Google, gráfico sin escala. Diagnosticados, sin aplicar.
