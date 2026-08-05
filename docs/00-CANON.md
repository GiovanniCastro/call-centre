# 00 · CANON — Perímetro

> **Documento único.** Si algo de aquí choca con el código, **gana el código** y este
> texto se corrige el mismo día. Cualquier otro documento del vault que contradiga
> a este está equivocado por definición.
>
> Fuera de aquí quedan: [[Propuesta-Desarrollo-Por-Fases]] (el cómo y el cuándo),
> [[Perimetro-Manual-Claude-Code]] (el protocolo de sesión),
> [[REFERENCIA-N8N]] (de dónde venimos), [[CALL_CENTRE_DOCS]] (qué ha cambiado y
> por qué) e [[INDEX]] (la puerta).

---

# PARTE 1 · QUÉ ES

**Perímetro** — agente de atención al cliente con enrutamiento híbrido entre modelo
local y modelo en la nube, instrumentado para auditar costo y salida de datos.

**Tesis.** Cada tarea se ejecuta en el lugar que le corresponde, y el operador
conserva el interruptor. El valor no está en que el agente responda; está en que
cada respuesta sea **rastreable, costeable y auditable**.

**Para qué.** Demo pública de portafolio y base de proyectos reales para pymes.

**Quién.** Giovanni Castro. Razona desde estos documentos, no desde el código: por
eso un documento desactualizado le hace decidir sobre una premisa falsa.

---

# PARTE 2 · LOS OCHO INVARIANTES

Nunca se rompen. Los cinco marcados con ⚙️ tienen comprobación automática que
bloquea el merge; ver [[Propuesta-Desarrollo-Por-Fases]] §5.

1. **Sin fuente no hay respuesta.** Si la recuperación no devuelve un fragmento por
   encima del umbral, el agente lo dice y escala. Nunca completa con conocimiento
   del modelo.
2. **Toda salida cumple un esquema declarado.** Lo que no valida no llega al
   usuario: se descarta y se registra.
3. ⚙️ **Cero salida de datos sensibles sin enmascarar.** Toda llamada externa pasa
   por la capa de saneo. Se registra qué salió y hacia dónde.
4. ⚙️ **Agnóstico al proveedor.** Cambiar de modelo es configuración, no
   reescritura. Ninguna clase del dominio importa el SDK de un proveedor.
5. ⚙️ **Todo evento se instrumenta.** Ninguna ruta de ejecución puede terminar sin
   emitir su evento de telemetría — ni sin emitirlo dos veces.
6. **Determinismo primero.** Clasificar, enrutar, validar y calcular ocurre en
   código auditable. El modelo redacta; no decide.
7. **Todo límite tiene un vigía**, con umbral y acción declarada: avisa, degrada o
   detiene. Los vigías son código determinista; jamás un modelo juzgando a otro.
8. ⚙️ **La proyección es de un solo sentido.** Firebase nunca escribe en el
   perímetro. El publicador es el único con permiso de escritura sobre Firestore y
   corre dentro del perímetro.

Los dos ⚙️ restantes son de higiene: sin `any`, y sin credenciales en el
repositorio.

---

# PARTE 3 · ARQUITECTURA EN DOS PLANOS

```
┌─ PERÍMETRO (autoalojado) ──────────────────────────────┐
│  núcleo Node/TS   PostgreSQL   Redis   Qdrant  Ollama  │
│  canales · enrutador · validación · vigías · acciones  │
│              publicador (un solo sentido)              │
└───────────────────────────┬────────────────────────────┘
                            │  agregados + trazas saneadas
                            ▼
┌─ PRESENTACIÓN (Firebase) ──────────────────────────────┐
│  Hosting · Auth · Firestore (solo lectura) · App Check │
│  Cloud Storage (corpus con procedencia)                │
└────────────────────────────────────────────────────────┘
```

**La demo pública no ejecuta inferencia en vivo.** Reproduce ejecuciones
registradas del lote de la fase 7. No consume presupuesto por visitante, no expone
el webhook y no depende de que la máquina con Ollama esté encendida.

## Stack fijado

| Capa | Elección | Nota |
|---|---|---|
| Núcleo | Node.js + TypeScript estricto | Sin `any` |
| Estado y telemetría | PostgreSQL | No se delega a Firestore |
| Colas y debounce | Redis | |
| Vectores | Qdrant | |
| Inferencia local | Ollama | Define la máquina de referencia |
| Inferencia nube | Proveedor configurable | Tras interfaz común |
| Panel y demo | **React**, servido por Firebase Hosting · Auth · Firestore · App Check | Solo presentación. React vive únicamente bajo `panel/` |
| Control de versiones | git + GitHub | Una rama y un PR por fase |
| CI | GitHub Actions | Los invariantes ⚙️ bloquean el merge |

## Fuera del stack, y por qué

- **n8n.** Es la [[REFERENCIA-N8N|referencia de la que venimos]], no una pieza del
  sistema. Nada de este proyecto se construye en n8n: ni plomería de canales.
- **Firestore como estado conversacional.** El costeo y el reparto son
  agregaciones relacionales; eso es SQL. Y meter conversaciones en un servicio
  alojado contradice el invariante 3.
- **Remote Config para umbrales.** Convierte la configuración en un canal mutable
  fuera del control de versiones. Un umbral que cambia sin dejar rastro no es
  auditable.
- **Hojas de cálculo** como memoria conversacional o almacén de clientes.
- **React en el perímetro.** El núcleo no tiene framework de interfaz. `src/**` no
  importa React ni nada de `panel/`; `panel/**` no importa `src/**`. Lo vigila el
  check de arquitectura, no la buena voluntad.

---

# PARTE 4 · ESTADO REAL

> Medido contra el disco el **4-ago-2026**. Nada copiado de otro documento.

**Medición de hoy, tras la fase 9:** **473 pruebas, 473 pasan, 0 omitidas**, más
**6 pruebas de reglas contra el emulador de Firestore**. `tsc --noEmit`, `eslint`
y `depcruise` sin problemas. **21 dependencias directas**, de las que 8 son de
producción — la fase 9 no añadió ninguna.

El informe de salud sobre la última corrida del lote, modo local: **40 % de
disponibilidad** sobre 65 operaciones, 60 % de tasa de error, **42.8 s** de
recuperación media sobre 17 episodios cerrados, y el presupuesto de error
consumido doce veces sobre un objetivo del 95 %. Cuatro grupos de falla, y el
grande —29 de 39— es el mismo que la fase 7 ya había medido: el modelo local no
sostiene la salida estructurada con citas literales.

**El proceso en marcha, ejercitado por primera vez el 4‑ago‑2026.** El perímetro
arranca con Redis, PostgreSQL y Qdrant conectados y escucha en `:8787`. `GET
/salud` y `GET /canales` responden `200`; **un `POST /webhook/telegram` sin el
secreto devuelve `401`**. La recuperación funciona contra el corpus indexado: la
consulta «¿Cuánto cuesta el seguro de inquilino?» devolvió dos fragmentos con
puntuación **0.775** y **0.612** sobre un umbral de 0.55, cada uno con su
identificador. Y tres casos pasados por el ciclo completo con gemma4 —lote
`comprobacion-en-vivo`— dieron **1 acierto de 3**, 20 256 ms de media, costo
PROVISIONAL y 1 de 1 de sensibilidad alta retenido.

**Y una costura que ninguna fase reclama como suya, medida el 4‑ago‑2026.** El
ciclo de caso funciona y **solo lo invoca el corredor del lote**: `src/core/caso`
lo importa un único archivo, `src/lote/corredor.ts`. La interfaz `Cola` declara
`encolar` y `pendientes` y **no declara desencolar**, así que el consumidor no es
que falte — no se puede escribir. `EmisorPostgres` no se instancia en ningún punto
de arranque, y `select count(*) from eventos` devuelve **0 filas**.

Un mensaje de Telegram se verifica, se deduplica, se limita, se normaliza, se
agrupa, se persiste y se encola. Ahí termina: nadie responde y no se emite evento.
El invariante 5 **no está roto** —ninguna ruta acaba sin su evento—; hay una ruta
que no acaba. De ahí nace [[Plan-Lazo-Del-Canal]], fase 11, y la corrección está en
[[CALL_CENTRE_DOCS]] R‑052.

**Las fases 0, 1, 2, 3 y 3B están construidas.** Hay tres canales: Telegram,
WhatsApp declarado sin credenciales, y `lote`, que alimenta casos desde archivos
por el mismo camino. Entra un mensaje por Telegram, se
verifica, se agrupa y se guarda. El corpus está indexado y se consulta con cita y
umbral. El enrutador clasifica, decide plano, sanea y redacta, con respaldo de
local a nube registrado como desvío. **Falta la credencial de nube**: sin
`ANTHROPIC_API_KEY` el plano de nube está declarado y sin configurar, así que el
sistema conversa solo en local — y lo dice al arrancar en lugar de fallar en la
primera queja.

**Lo que la fase 3 hace cierto, con prueba.** Una petición de sensibilidad alta
jamás produce una llamada externa: el espía sobre el módulo de salida lo verifica
con adaptadores que salen de verdad, no con dobles. Y una llamada a un dominio no
declarado se bloquea antes de abrir el socket, aunque el código la intente.

Medido contra el CI **y también en local** al cerrar la fase 3: **331 pruebas,
331 pasan, 0 omitidas** — incluidas las que corren contra Redis, PostgreSQL y
Qdrant reales, en contenedores. 11 dependencias directas. (La cifra de hoy está
arriba: las fases 4 a 8A añadieron cien pruebas más.)

**El corpus está indexado**: 17 documentos, 106 fragmentos, `bge-m3` local por
Ollama, 8 segundos de ingestión completa. La reingestión sin cambios cuesta cero
llamadas al modelo.

**Lo que la fase 2 no consiguió, y está medido.** El umbral de similitud detiene
todas las consultas ajenas al dominio y deja pasar todas las cubiertas, pero **no
puede detener las preguntas del dominio cuya respuesta falta**: sus puntuaciones
se solapan con las legítimas. El invariante 1 se reparte entre el umbral (fase 2)
y el verificador de procedencia (fase 4). Ver R‑024, que trae la medición.

**Publicado** en `github.com/GiovanniCastro/call-centre`, con `main` protegida y el
CI actuando — ver R‑018. La fase 0 se cerró con el PR #1 y la etiqueta `v0.0`.

El repositorio se llama `call-centre`; el producto se llama **Perímetro**. El slug
de la URL no es el nombre del proyecto: el canon, `CLAUDE.md` y `package.json`
dicen Perímetro, y son ellos los que mandan.

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Contrato de datos, telemetría, costeo, andamiaje | **CONSTRUIDO** |
| 1 | Canal Telegram endurecido y aislamiento en repositorio | **CONSTRUIDO** |
| 2 | Corpus y base de conocimiento con citación | **CONSTRUIDO** |
| 3 | Enrutador local/nube y frontera de salida | **CONSTRUIDO** |
| 3B | Segundo canal (`lote`) y conector de WhatsApp | **CONSTRUIDO** |
| 4 | Salida estructurada con procedencia, validación y escalado | **CONSTRUIDO** |
| 4B‑1 | Vigías que detienen | **CONSTRUIDO** |
| 4B‑2 | Vigías que observan | **CONSTRUIDO** |
| 4C | Detección | **CONSTRUIDO** |
| 5 | Acciones, idempotencia, interfaz CRM | **CONSTRUIDO** |
| 6 | Panel sobre histórico real | **CONSTRUIDO** |
| 7 | Lote de casos y corredor tri‑modo | **CONSTRUIDO** |
| 6B | Selector de modo y punto de equilibrio | **CONSTRUIDO** |
| 8A | Operación autoalojada, respaldos, secretos, demo por reproducción | **CONSTRUIDO** |
| 8B | Hosting, Auth, App Check y webhook en producción | PROPUESTO · falta proyecto de Firebase |
| 9 | Vigía de fallas e informe de salud | **CONSTRUIDO** |
| 11A | Montaje compartido y trabajador del ciclo | PROPUESTO · **camino crítico** |
| 11B | Respuesta por el canal, sin duplicar | PROPUESTO · camino crítico |
| 11C | Cola persistente y ciclo de vida del proceso | PROPUESTO · camino crítico |
| 11D | El panel de operación sobre tráfico real | PROPUESTO · camino crítico |
| 12A | El perfil de negocio, y el léxico fuera del código | PROPUESTO |
| 12B | Plantillas por herencia y arranque de un negocio nuevo | PROPUESTO |
| 12C | Marca y vocabulario en el panel | PROPUESTO |
| 13A | El escalado llega a un humano por un canal que ya existe | PROPUESTO |
| 13B | La bandeja propia, cuando el volumen la pida | PROPUESTO |
| 10 | Canal de voz | PROPUESTO · opcional |

La fase **11 se numera la última y se ordena la primera**: va antes que 8B y que
10. El número dice cuándo se escribió; el orden, cuándo se hace — ver R‑055 y
[[Plan-Lazo-Del-Canal]]. Desplegar el panel sobre una proyección vacía sería
publicar la maqueta.

Las fases **12** ([[Plan-Perfil-De-Negocio]]) y **13** ([[Plan-Soporte]]) van
después de la 11 y antes que la 10, por el mismo criterio: configurar un negocio
cuyo agente no contesta es decorar, y atender escalados exige que existan
escalados de tráfico real. **El plano de control multi‑cliente no está en esta
tabla**: solo lee proyecciones y vive en otro repositorio, porque este es un
perímetro — uno. Ver R‑061.

## Lo que existe hoy

De la fase 0:

- **Esquema del evento de telemetría** (`src/telemetry/evento.ts`) con el enum
  desdoblado, y sus derivadores: toda métrica que cuente escalados a humano o
  desvíos de ejecución pasa por la misma función.
- **Arnés de instrumentación** (`src/telemetry/arnes.ts`). Falla si una ruta
  termina con cero eventos o con dos, incluidas las rutas que terminan en
  excepción.
- **Función de costeo** (`src/core/costeo/costear.ts`). Fuente única, pura,
  con pruebas para nube, local e híbrido. Devuelve el costo y los supuestos.
- **Migraciones de PostgreSQL** (`migrations/001_inicial.sql`): contactos,
  conversaciones, mensajes, eventos y prospectos. Los invariantes 1, 3 y 5 están
  también como `CHECK` y como índice único.
- **Configuración versionada**: `config/precios.json` con precios reales y su
  fuente; `config/maquina-referencia.json` en estado PROVISIONAL.
- **CI** en GitHub Actions: gitleaks, tipos, lint, arquitectura y pruebas.
  Comprobado añadiendo violaciones a propósito y viéndolas fallar.
- **`CLAUDE.md`** y la plantilla de PR con los criterios de aceptación como
  casillas.

De la fase 1:

- **Interfaz `Canal`** con tres métodos: verificar credencial, normalizar y
  responder. La verificación vive ahí y no en el webhook, porque cada canal la
  hace distinta — Telegram con secreto compartido, WhatsApp con HMAC.
- **Adaptador de Telegram** y **conector de WhatsApp** escrito entero pero
  registrado como `no_configurado`, declarando qué necesita para instalarse.
- **El borde** (`src/borde/`): servidor de webhook sobre `node:http`, techos de
  tamaño por bytes, límite de tasa por origen y por contacto, rechazo de
  repetición y ventana de agrupación. El orden de las comprobaciones **es** la
  regla de seguridad.
- **`src/repos/` con alcance de contacto obligatorio** — R‑021. Tres capas:
  marca de símbolo en el tipo, comprobación en ejecución, y una prueba que
  recorre el árbol sintáctico y falla si aparece una función exportada sin
  alcance o una consulta sin filtro.
- **Umbrales en `config/limites.json`**, cada uno con su porqué escrito al lado.

De la fase 7:

- **Lote de 65 casos** (`lote/casos.json`) en nueve categorías, escritos a mano
  contra el corpus de Nimbo Seguros: veinte de catálogo cubierto, diez de hueco
  deliberado, **doce de sensibilidad alta** —para que el vigía de perímetro tenga
  denominador—, cinco ambiguos, cinco fuera de alcance, cuatro de datos de otro
  contacto, cuatro de inyección, cuatro de queja y uno de repetición.
- **Corredor tri‑modo** (`src/lote/corredor.ts`). Los tres modos son la misma
  política con las reglas reescritas, no tres rutas de código: un modo con ruta
  propia mediría un camino que producción no recorre. **La regla dura no se
  reescribe en ningún modo.**
- **Informe comparativo** (`src/lote/informe.ts`), del que salen las cifras del
  portafolio y de ningún otro sitio. Declara sus huecos: un modo que no se pudo
  correr sale como `NO CORRIDO` con su motivo, nunca con ceros.
- **`npm run lote`**, un solo comando de principio a fin.

Lo medido, y solo lo medido — modo local. **La cifra vigente es la del 4‑ago**,
que es la que está grabada en `lote/resultados/fase-7-v1.json`:

| | 1‑ago (2 corridas) | **4‑ago, vigente** |
|---|---|---|
| Acierto | 51 % (33 de 65) | **48 %** (31 de 65) |
| Casos que reventaron | 0 | **7** |
| Latencia media | ~13 s por caso | ~13 s por caso |
| Costo por caso resuelto | PROVISIONAL | PROVISIONAL |
| Perímetro | 12 de 12 retenidos | 12 de 12 retenidos |

El acierto no bajó porque el agente empeorara: **siete casos superan hoy el plazo
de la inferencia local**, revientan, y cada uno se lleva su evento de telemetría
por delante. Lo destapó el informe de salud de la fase 9 en su primera corrida
real, y está en el **issue #32** — no se parcheó dentro de la fase que lo
encontró. Se comprobó además que no era la máquina ocupada: la corrida limpia dio
más excepciones que la contaminada, no menos.

Perímetro sigue siendo **vacuo en modo local**, ver R‑032. Inyección: 4 de 4, sin
fugas. Fuera de alcance: 5 de 5 escalados, ninguno inventado.

Los modos **nube e híbrido no se han corrido**: falta `ANTHROPIC_API_KEY`. El
informe los marca `NO CORRIDO` con su motivo, y la comparación que justifica el
proyecto sigue sin existir.

El grueso de los fallos que quedan se concentra en un sitio: **gemma4 no sostiene
la salida estructurada con citas literales**. «sustento 0 %», «sustento 50 %», «el
modelo no devolvió JSON analizable». No se arregla aflojando el verificador — es
la medición que la fase existía para producir.

De la fase 6:

- **Persistencia de eventos** (`src/telemetry/emisor-postgres.ts`, `src/repos/eventos.ts`).
  Hasta ahora solo vivían en memoria. Encola y vuelca; lo que falla vuelve a la
  cola y se dice.
- **Agregados** (`src/repos/agregados.ts`), fuente única de cada concepto. Ninguna
  de sus consultas puede devolver una columna que identifique a alguien —prueba
  estructural sobre el árbol sintáctico, más otra contra la base real.
- **Publicador** (`proyeccion/`) sobre un puerto que **no sabe leer**: el invariante
  8 escrito en el tipo. Adaptador de archivos construido; el de Firestore es lo que
  falta.
- **Reglas de Firestore** escritas y razonadas (`proyeccion/reglas/firestore.rules`).
  **Sin probar**: el emulador necesita `firebase-tools`.
- **Registro de acceso al panel, incluidas las lecturas** (`migrations/005_accesos.sql`).
  Dos roles que no se incluyen: ver métricas no es ver contenido.
- **Actuaciones de vigía e incidentes** persistidos (`migrations/006_actuaciones.sql`),
  en dos tablas porque son dos cosas: un límite cruzado y un intento de alguien.
- **Panel en React** (`panel/`), único sitio del repositorio con React. Lee la
  proyección publicada; no calcula nada. La banda de demostración es una
  consecuencia del tipo, no un `<div>` que alguien pueda borrar.

De la fase 8A:

- **Capa de secretos** (`src/operacion/secretos.ts`). Declara cada credencial —de
  qué es, qué se pierde sin ella, de dónde sale—, la informa al arrancar sin decir
  su valor y **redacta** todo lo que salga del proceso, por valor y por forma. Una
  prueba estructural falla si aparece una variable con forma de credencial sin
  declarar; encontró `EMBEDDINGS_NUBE_CLAVE`, sin declarar desde la fase 2.
- **Respaldos con restauración verificada** (`src/operacion/respaldo.ts`). Una
  sola orden que vuelca, restaura en una base aparte y compara los recuentos tabla
  por tabla. Se niega a restaurar sobre producción. Ejecutado: **14 tablas, 1016
  filas, restauradas y verificadas**.
- **Demo pública por reproducción** (`proyeccion/demo.ts`). Se publica sin
  `DATABASE_URL`, sin Ollama y sin una sola llamada de red — con espía sobre
  `fetch`, con la regla `demo-sin-inferencia` en el grafo de dependencias, y con
  el saneo actuando: los doce casos de sensibilidad alta salieron enmascarados.
- **Adaptador de Firestore** (`proyeccion/destinos/firestore.ts`), el único módulo
  del repositorio que importa el SDK de Firebase.
- **Runbook de despliegue** en [[DESPLIEGUE]], con cada sección marcada como
  ejecutada o no ejecutada.

De la fase 9:

- **Vigía de fallas** (`src/core/fallas/`), el décimo. Es el único que no vigila
  un límite sino lo que se rompe, y por eso su umbral no está sobre los fallos
  —cero fallos no es un objetivo alcanzable— sino sobre el **presupuesto de
  error**: se declara qué disponibilidad se pretende sostener y el margen que
  queda por debajo es lo que se puede gastar. Autoridad de avisar.
- **Qué cuenta como falla, escrito una sola vez** (`desde-caso.ts`). Falla es que
  el sistema no pudiera hacer su trabajo, no que decidiera correctamente no
  hacerlo. Un escalado por falta de fuente es el invariante 1 funcionando y no
  baja la disponibilidad — ver R‑047.
- **Clasificación por significado** (`clasificar.ts`), nueve clases definidas por
  su remedio. El mismo `ECONNREFUSED` sale como `servicio_local_caido` o
  `proveedor_caido` según de qué lado del perímetro estuviera el destino, porque
  los dos remedios son opuestos. `desconocida` es una clase de primera y su
  recuento es la lista de trabajo del clasificador.
- **Agrupación por huella** (`huella.ts`). Mil errores idénticos son una fila con
  contador. La plantilla se **sanea antes de normalizar**, no después: al revés,
  un número de seguro social ya sería `N-N-N` cuando el saneo lo mirara.
- **Informe en dos formatos que son uno** (`informe.ts`): una estructura y una
  vista de ella. Por debajo del denominador mínimo **no imprime** el encabezado;
  dice que no es concluyente y enseña cuántas observaciones tiene.
- **`npm run salud`**, sin base de datos, sin Ollama y sin red.
- **«El informe propone; nunca aplica»** como regla del grafo de dependencias
  —probada con cebo— más una prueba sobre el árbol sintáctico de la carpeta
  entera, que cubre lo que la regla no ve.

## Lo que la fase 8A cerró de la fase 6

Los dos criterios de la fase 6 que llevaban abiertos desde el 2‑ago‑2026 **están
cumplidos**, contra el emulador de Firestore y con `Java 21` en el CI:

- Una prueba falla si un cliente autenticado puede escribir en la proyección.
- Una prueba falla si un rol de métricas puede leer una traza con contenido.

Seis pruebas de reglas en total, comprobadas además al revés: se rompió
`allow write: if false` a propósito y la prueba lo detectó.

**Sigue faltando Firebase Auth con `custom claims` para los dos roles**, que es
fase 8B: las reglas ya distinguen los roles, pero no hay cuentas reales a las que
asignárselos.

De antes:

- La maqueta HTML de la pantalla de Operación. **Sus cifras son inventadas y se
  contradicen entre sí** — ver [[CALL_CENTRE_DOCS]] R‑002. Sirve como referencia
  de composición, no de datos.
- El flujo de referencia en n8n, funcionando. Ver [[REFERENCIA-N8N]].
- Este vault.

## Lo que bloquea

- ~~El corpus de la empresa ficticia.~~ **Ya no bloquea** (R‑022, sustituido por
  R‑023). Diecisiete documentos de **Nimbo Seguros** —aseguradora digital
  ficticia, mercado estadounidense, cinco ramos— en `corpus/`, con cinco omisiones
  deliberadas para que la fase 2 pueda probar que una pregunta sin respuesta
  devuelve vacío, y un documento envenenado para la fase 4C. Sustituye al corpus
  de clínica dental: el dominio asegurador aporta la cobertura condicional y los
  datos sensibles reales que el anterior no tenía.
- ~~La aprobación de WhatsApp Business.~~ **Ya no bloquea** (R‑020). El canal
  primario es Telegram, que solo necesita un token de `@BotFather`. WhatsApp entra
  como conector declarado que se activa cuando existan número corporativo y
  credenciales de Meta.
- **La máquina de referencia para Ollama.** Sin definirla, las cifras de costo
  local no se pueden defender. Desde la fase 0 el bloqueo es visible en el propio
  dato: `config/maquina-referencia.json` está en estado `PROVISIONAL`, y todo
  costo que se apoye en él sale con `provisional: true` — ver R‑017.
- ~~No hay Docker en la máquina de desarrollo.~~ **Resuelto el 31‑jul‑2026**,
  antes de la fase 2 como se pedía. Docker 29.6.2 y Compose v5.3.1; los tres
  servicios levantan en las versiones del CI y `npm run verificar` corre la suite
  completa con **0 omitidas** en local. Qdrant ya se usa desde la fase 2.
- **El proveedor de nube concreto**, ahora por partida doble. Para la inferencia
  frontera, `config/precios.json` lleva las tarifas de Anthropic con su fuente y
  fecha; elegir otro es añadir su bloque, no tocar código. Para **embeddings** el
  problema es distinto y la fase 2 lo destapó: Anthropic no tiene API de
  embeddings, así que el origen de nube sería un proveedor **diferente** al de la
  inferencia, con su cuenta, su tarifa y su clase de sensibilidad. Hoy el
  adaptador está declarado y sin configurar, y dice qué le falta al arrancar.

---

# PARTE 5 · GLOSARIO

**Perímetro.** El plano autoalojado donde viven los datos. Un dato «sale del
perímetro» cuando viaja a un proveedor externo.

**Vigía.** Componente determinista que observa un umbral y actúa: avisa, degrada o
detiene. Nunca es un modelo.

**Escalado a humano.** El caso sale a la cola de un operador. Distinto de
**desvío de ejecución**, que es cuando el modelo local no alcanza y el caso va a la
nube. Son dos campos separados en telemetría, precisamente porque confundirlos
produce cifras irreconciliables.

**Sustento.** Proporción de campos de una respuesta cuya procedencia se verificó
contra un fragmento recuperado en esa misma ejecución.

**Procedencia.** El `fragmento_id` que acompaña a cada dato factual de la salida
del modelo. El verificador comprueba que existe, que se recuperó en esta ejecución
y que el valor aparece literalmente en él. Esto es un `join`, no inferencia.

**Proyección.** La copia de solo lectura en Firestore, saneada y agregada, que
alimenta el panel. Nunca escribe hacia el perímetro.

**Reproducción.** El modo de la demo pública: sirve ejecuciones registradas del
lote, sin inferencia en vivo.

---

# PARTE 6 · DECISIONES TOMADAS

Cada una con su entrada en [[CALL_CENTRE_DOCS]].

| # | Decisión | Alternativa descartada |
|---|---|---|
| R‑001 | Arquitectura en dos planos, proyección de un solo sentido | Firebase como base de datos principal |
| R‑002 | Enum `resultado` desdoblado en `resultado` + `desvio_ejecucion` | Un solo campo con ambos significados |
| R‑003 | Verificador de procedencia por `fragmento_id`, no NLI | Modelo verificador (viola invariante 7); solapamiento léxico (puntuación sin significado) |
| R‑004 | Restricciones estructurales de 4C bajan a las fases 1, 3 y 5 | Dejarlas al final, como en el plan original |
| R‑005 | Fase 4B partida en tres; informe de salud fuera del camino crítico | Una sola fase de once vigías más informes |
| R‑006 | Fase 7 se ejecuta antes que el selector de modo del panel | Fase 6 completa antes que la 7 |
| R‑007 | Telegram sube de la fase 8 a la 3B | Telegram al final, junto con voz |
| R‑008 | Los invariantes se mecanizan como checks de CI | Invariantes solo en `CLAUDE.md` |
| R‑009 | Demo pública por reproducción, no inferencia en vivo | Demo en vivo contra el perímetro |
| R‑010 | n8n queda como referencia; no entra en el stack | n8n como plomería de canales |
| R‑011 | Fase 8 de despliegue y operación | Terminar el plan en el canal de voz |
| R‑012 | El panel se construye en React, solo bajo `panel/` | Dejar la interfaz sin decidir |
| R‑013 | El repositorio nace en la raíz del vault | Repositorio en subcarpeta, documentación fuera |
| R‑014 | Siete dependencias directas; pruebas con `node:test` | `vitest`, `@eslint/js`, `pg` desde ya |
| R‑015 | Node ejecuta TypeScript sin compilar; sintaxis borrable | Paso de compilación y artefacto intermedio |
| R‑016 | Invariantes 1 y 3 como restricción de esquema y de base | Dejarlos como reglas escritas |
| R‑017 | El costeo local sale marcado como provisional | Rellenar la máquina de referencia con cifras plausibles |
| R‑018 | Repositorio público, `main` protegida también para administradores | Repositorio privado; eximir al dueño de la protección |
| R‑019 | TypeScript 7 se aplaza hasta que `@typescript-eslint` lo admita | Forzarlo con `--legacy-peer-deps` |
| R‑020 | El canal primario es Telegram; WhatsApp es un conector declarado | WhatsApp en la fase 1, con el proyecto detrás de un trámite de Meta |
| R‑021 | Alcance de contacto en tres capas: marca, comprobación y prueba estructural | Convención y revisión de código; *row‑level security* (aplazada a la fase 8) |
| R‑022 | Corpus con omisiones deliberadas y un documento envenenado | Un corpus que lo cubra todo y sea uniformemente limpio |
| R‑031 | Cero campos factuales escala, salvo saludo y pregunta de aclaración; el costo provisional no se publica | Enviar la prosa del modelo con sustento pleno por vacuidad; imprimir `$0.0000` |
| R‑032 | La inyección se juzga por incidente registrado y ausencia de fuga; «12 de 12 retenidos» en local sale con su advertencia | `debe_escalar: false`, que premiaba responder inyecciones; publicar la cifra de contención a secas |
| R‑033 | El muestreo vive en `config/politica.json`, en 0, y viaja por el puerto de inferencia | Temperatura por omisión del proveedor; o fijarla solo en el corredor de la fase 7 |
| R‑034 | El KPI y el reparto leen la misma variable: la reconciliación se hace imposible | Dos cálculos más una prueba de que coinciden |
| R‑035 | Emisor que encola y vuelca, con lo fallido de vuelta a la cola | Escribir dentro de `emitir` con `void promesa`, perdiendo los errores |
| R‑036 | Exenciones al alcance con una comprobación propia más estricta que la exención | Eximir el archivo y confiar; o relajar el patrón de la regla |
| R‑037 | La banda de demostración sale de una unión discriminada, no de un acuerdo | Un `<div>` que el panel se acuerda de renderizar |
| R‑038 | El panel comparte tipos con el perímetro, nunca valores, verificado sobre el paquete | Duplicar los tipos en `panel/`; o dejar que importe código |
| R‑039 | Las reglas de Firestore se unen por OR: un `allow read: if false` final no cierra nada | Creer que la última regla escrita manda |
| R‑040 | La fase 8 se parte en 8A (autoalojada) y 8B (nube) | Cerrar la fase 8 con dos criterios sin cumplir, anotados como pendientes |
| R‑041 | Cuatro dependencias de Firebase; tres de desarrollo, y se dice el peso de `firebase-tools` | Meterlas todas en producción; o esquivar el emulador y dejar las reglas sin probar |
| R‑042 | El respaldo y su restauración son la misma orden, y la base de verificación nunca es producción | Volcar y comprobar por separado; confiar en el código de salida de `pg_dump` |
| R‑043 | Los secretos se declaran, y una prueba estructural falla si falta alguno | Una lista mantenida a mano; redactar solo lo que alguien recuerde |
| R‑044 | La demo pública es una tercera clase de fuente: ni en vivo ni de demostración | Reutilizar la bandera de demostración, vendiendo como falso lo que sí se midió |
| R‑045 | Corrección: el canon daba por PROPUESTAS las fases 6, 7 y 6B, ya construidas | Dejar la tabla como estaba y confiar en el texto de más abajo |
| R‑046 | La exención de gitleaks es por valor literal, y en la sintaxis que el CI entiende | Eximir la ruta del archivo de prueba, que lo deja abierto para siempre |
| R‑047 | Falla es que el sistema no pudiera, no que decidiera correctamente que no | Contar como fallo todo caso que no acabó en `resuelto` |
| R‑048 | La clasificación de fallas mira a dónde iba la llamada, y `desconocida` se ve | Traducir códigos de estado a etiquetas; repartir lo no reconocido en el cajón que más se le parezca |
| R‑049 | El informe de salud se compone sobre lo grabado, sin tabla nueva | Una tabla de fallas en PostgreSQL, que ata el informe a que la base esté en pie |
| R‑050 | «El informe propone, nunca aplica» como regla del grafo más prueba estructural | Dejarlo escrito en el criterio de aceptación y confiar |
| R‑051 | La maqueta entra en el panel; lo que no tiene fuente no se dibuja, y la hoja de estilos no contiene ni una altura de barra | Portarla entera y rellenar la serie temporal, el selector de periodo y los vigías con datos plausibles |
| R‑052 | Corrección: el ciclo de caso funciona y solo lo invoca el corredor del lote | Leer «fases 0 a 9 construidas» como que el sistema contesta |
| R‑053 | El montaje del ciclo se comparte con el corredor, con prueba estructural | Un montaje propio para producción, con el lote midiendo un camino que producción no recorre |
| R‑054 | La cola gana lado de consumo y pasa a Redis, con confirmación explícita | Llamar a `atender` desde el webhook, convirtiendo la ventana de agrupación en decoración |
| R‑055 | La fase 11 se numera la última y se ordena la primera | Renumerar el plan para insertarla como 5B, moviendo referencias en ocho documentos y en las etiquetas |
| R‑056 | Los productos de un negocio son su corpus: configurarlos es subir documentos | Un editor de catálogo, que el verificador de procedencia rechazaría o que abriría una vía para saltarse el invariante 1 |
| R‑057 | Corrección: los esquemas de salida ya son agnósticos; el perfil no los declara | Campos factuales por sector, que darían un verificador de procedencia por sector |
| R‑058 | Plantillas por herencia sobre una `base`, y cuatro en vez de ocho | Un archivo completo copiado por sector, con cuatro léxicos divergiendo en silencio |
| R‑059 | Un perfil declara capacidades y palabras; jamás vigías, umbrales ni saneo | Dejar el perfil abierto y confiar en que nadie degrade un vigía desde un JSON |
| R‑060 | El panel lee, el perímetro escribe — para credenciales, perfil y escalados | Formularios de escritura en el panel de Firebase, rompiendo el invariante 8 |
| R‑061 | La bandeja del operador va primero, sobre un canal que ya existe; el plano de control es otro repositorio y solo lee | Empezar por la consola multi‑cliente; o darle escritura sobre los perímetros |
| R‑062 | El lote tiene un identificador duplicado: la fila se distingue por posición, no se deduplica | Quitar la fila repetida, dejando la pantalla limpia y el defecto invisible |
| R‑063 | Antes que cualquier fase, la clave de nube: desbloquea la comparación que justifica el proyecto | Empezar por la fase 11 y dejar dos de las tres columnas del informe en `NO CORRIDO` |
