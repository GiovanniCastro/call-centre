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
| **2** | 2026‑07‑31 | R‑012 … R‑019 | Fase 0 construida: repositorio, telemetría, costeo, migraciones y CI. React fijado para el panel. Repositorio público en GitHub |
| **1** | 2026‑07‑30 | R‑001 … R‑011 | Revisión del plan, propuesta de desarrollo por fases, arquitectura en dos planos, vault de Obsidian |

---

## Contenido

- [Revisión 2026‑07‑31](#revisión-2026-07-31)
  - [R‑012 · El panel se construye en React](#r-012--el-panel-se-construye-en-react)
  - [R‑013 · El repositorio nace en la raíz del vault](#r-013--el-repositorio-nace-en-la-raíz-del-vault)
  - [R‑014 · Conjunto mínimo de dependencias](#r-014--conjunto-mínimo-de-dependencias-para-la-fase-0)
  - [R‑015 · Node ejecuta TypeScript sin compilar](#r-015--node-ejecuta-typescript-sin-paso-de-compilación)
  - [R‑016 · Invariantes 1 y 3 como restricciones](#r-016--los-invariantes-1-y-3-pasan-de-prosa-a-restricción-estructural)
  - [R‑017 · El costeo local se marca provisional](#r-017--el-costeo-local-sale-marcado-como-provisional)
  - [R‑018 · El repositorio es público](#r-018--el-repositorio-es-público-desde-el-primer-commit)
  - [R‑019 · TypeScript 7 se aplaza](#r-019--typescript-7-se-aplaza-hasta-que-typescript-eslint-lo-admita)
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
