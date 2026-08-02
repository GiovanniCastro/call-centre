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

> Medido contra el disco el **1-ago-2026**. Nada copiado de otro documento.

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

Medido contra el CI **y también en local**: **331 pruebas, 331 pasan, 0
omitidas** — incluidas las que corren contra Redis, PostgreSQL y
Qdrant reales, en contenedores. `tsc --noEmit`, `eslint` y `depcruise` sin
problemas. 11 dependencias directas.

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
| 6 | Panel sobre histórico real | PROPUESTO |
| 7 | Lote de casos y corredor tri‑modo | PROPUESTO |
| 6B | Selector de modo y punto de equilibrio | PROPUESTO |
| 8 | Despliegue, operación y demo pública | PROPUESTO |
| 9 | Vigía de fallas e informe de salud | PROPUESTO |
| 10 | Canal de voz | PROPUESTO · opcional |

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

Lo medido, y solo lo medido — modo local, dos corridas con código idéntico:

| | Valor |
|---|---|
| Acierto | **51 %** (33 de 65), idéntico en las dos corridas |
| Casos idénticos entre corridas | 64 de 65 |
| Latencia media | ~13 s por caso |
| Costo por caso resuelto | **PROVISIONAL** — la máquina de referencia sigue sin caracterizar |
| Perímetro | 12 de 12 retenidos, 0 escapados — **vacuo en modo local**, ver R‑032 |
| Inyección | 4 de 4, ninguna filtró nada |
| Fuera de alcance | 5 de 5 escalados, ninguno inventado |

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

## Lo que falta de la fase 6

Tres criterios de aceptación quedan **sin cumplir**, todos por la misma razón:
necesitan Firebase, y sus dependencias no están aprobadas.

- Una prueba en el emulador que falle si un cliente autenticado puede escribir en
  la proyección.
- Una prueba que falle si un rol de métricas puede leer una traza con contenido.
  *La lógica sí está probada* (`decidirAcceso`) y las reglas están escritas; lo
  que falta es ejercitarlas contra Firestore.
- Firebase Auth con `custom claims` para los dos roles.

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
