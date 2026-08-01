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

> Medido contra el disco el **31-jul-2026**. Nada copiado de otro documento.

**Las fases 0 y 1 están construidas.** Entra un mensaje por Telegram, se verifica,
se agrupa y se guarda. **Nadie responde todavía**: no hay recuperación ni
enrutador, así que el sistema escucha y registra, no conversa.

Medido contra el CI: **99 pruebas, 99 pasan, 0 omitidas** — incluidas las que
corren contra Redis y PostgreSQL reales, en contenedores. `tsc --noEmit`, `eslint`
y `depcruise` sin problemas. 9 dependencias directas.

**Publicado** en `github.com/GiovanniCastro/call-centre`, con `main` protegida y el
CI actuando — ver R‑018. La fase 0 se cerró con el PR #1 y la etiqueta `v0.0`.

El repositorio se llama `call-centre`; el producto se llama **Perímetro**. El slug
de la URL no es el nombre del proyecto: el canon, `CLAUDE.md` y `package.json`
dicen Perímetro, y son ellos los que mandan.

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Contrato de datos, telemetría, costeo, andamiaje | **CONSTRUIDO** |
| 1 | Canal Telegram endurecido y aislamiento en repositorio | **CONSTRUIDO** |
| 2 | Corpus y base de conocimiento con citación | PROPUESTO |
| 3 | Enrutador local/nube y frontera de salida | PROPUESTO |
| 3B | Segundo canal (`lote`) y conector de WhatsApp | PROPUESTO |
| 4 | Salida estructurada con procedencia, validación y escalado | PROPUESTO |
| 4B‑1 | Vigías que detienen | PROPUESTO |
| 4B‑2 | Vigías que observan | PROPUESTO |
| 4C | Detección | PROPUESTO |
| 5 | Acciones, idempotencia, interfaz CRM | PROPUESTO |
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

De antes:

- La maqueta HTML de la pantalla de Operación. **Sus cifras son inventadas y se
  contradicen entre sí** — ver [[CALL_CENTRE_DOCS]] R‑002. Sirve como referencia
  de composición, no de datos.
- El flujo de referencia en n8n, funcionando. Ver [[REFERENCIA-N8N]].
- Este vault.

## Lo que bloquea

- ~~El corpus de la empresa ficticia.~~ **Ya no bloquea** (R‑022). Diecisiete
  documentos de la Clínica Dental Aurora —ficticia— en `corpus/`, con omisiones
  deliberadas para que la fase 2 pueda probar que una pregunta sin respuesta
  devuelve vacío, y un documento envenenado para la fase 4C.
- ~~La aprobación de WhatsApp Business.~~ **Ya no bloquea** (R‑020). El canal
  primario es Telegram, que solo necesita un token de `@BotFather`. WhatsApp entra
  como conector declarado que se activa cuando existan número corporativo y
  credenciales de Meta.
- **La máquina de referencia para Ollama.** Sin definirla, las cifras de costo
  local no se pueden defender. Desde la fase 0 el bloqueo es visible en el propio
  dato: `config/maquina-referencia.json` está en estado `PROVISIONAL`, y todo
  costo que se apoye en él sale con `provisional: true` — ver R‑017.
- **No hay Docker en la máquina de desarrollo.** Todo lo que toca Redis o
  PostgreSQL solo se ejecuta en el CI, nunca en local. Descubierto construyendo la
  fase 1. La fase 2 añade Qdrant y agrava el problema: conviene resolverlo antes.
- **El proveedor de nube concreto** para la inferencia frontera. `config/precios.json`
  lleva hoy las tarifas de la API de Anthropic con su fuente y su fecha de
  consulta; elegir otro proveedor es añadir su bloque, no tocar código.

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
