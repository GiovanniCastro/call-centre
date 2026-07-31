# Perímetro — Propuesta de desarrollo por fases

Esta propuesta reordena el plan de `fases.md` a partir de tres decisiones: dónde
entra Firebase sin romper la tesis, qué se convierte en comprobación automática
en lugar de regla escrita, y qué restricciones de la fase 4C tienen que subir a
las fases donde nace el código que protegen.

No cambia el alcance del proyecto. Cambia el orden, el reparto y el mecanismo.

---

## 1. Las seis decisiones de esta propuesta

**Una.** El sistema vive en **dos planos**: el perímetro, autoalojado, donde
están los datos; y la presentación, en Firebase, que solo ve una proyección
saneada. El flujo es de un solo sentido. Nada entra al perímetro desde Firebase.

**Dos.** La demo pública **no ejecuta inferencia en vivo**: reproduce ejecuciones
registradas del lote de la fase 7. Esto no es un atajo, es lo que el plan ya
pedía en dos sitios — «el panel funciona sin datos en vivo, leyendo el histórico
registrado» y «la demo pública no consume presupuesto de API por visitante».
Consecuencia práctica: la demo no depende de que tu máquina con Ollama esté
encendida.

**Tres.** Los invariantes dejan de ser prosa y pasan a ser **comprobaciones de
CI que bloquean el merge**. Cinco de los siete son mecanizables.

**Cuatro.** La fase 4C se **redistribuye**. Sus restricciones estructurales bajan
a las fases 1, 3 y 5; lo que queda es la capa de detección, que es lo que el
propio principio rector dice que es: la segunda línea.

**Cinco.** La fase 4B se **parte en tres** y el informe de salud sale del camino
crítico.

**Seis.** El campo `resultado` de la telemetría se **desdobla** antes de escribir
el primer evento, porque hoy mezcla dos escalados distintos y eso hace
irreconciliables las cifras del panel.

---

## 2. Arquitectura en dos planos

```
┌─ PERÍMETRO (autoalojado) ──────────────────────────────┐
│  núcleo Node/TS   PostgreSQL   Redis   Qdrant  Ollama  │
│  canales · enrutador · validación · vigías · acciones  │
│                                                        │
│              publicador (un solo sentido)              │
└───────────────────────────┬────────────────────────────┘
                            │  agregados + trazas saneadas
                            ▼
┌─ PRESENTACIÓN (Firebase) ──────────────────────────────┐
│  Hosting (panel)   Auth (operadores)   Firestore (RO)  │
│  App Check         Cloud Storage (corpus)              │
└────────────────────────────────────────────────────────┘
```

**Invariante nuevo, al mismo nivel que los siete del preámbulo:**

> **8. La proyección es de un solo sentido.** Firebase nunca escribe en el
> perímetro. El publicador es el único componente con permiso de escritura sobre
> Firestore, y corre dentro del perímetro. Ninguna credencial de administrador de
> Firebase existe fuera de él.

Esto además fortalece el argumento comercial en lugar de diluirlo: puedes
enseñar que el panel público no tiene acceso a la base de datos, solo a una
proyección de la que se han retirado los datos.

---

## 3. Dónde entra Firebase y dónde no

**Sí:**

| Servicio | Uso | Qué requisito del plan cubre |
|---|---|---|
| **Hosting** | Panel y demo pública, dominio propio, TLS | Fase 6; el despliegue que el plan no tenía |
| **Authentication** | Acceso de operadores, sesiones cortas, *custom claims* por rol | 4C-G: autenticación obligatoria y separación de permisos |
| **Firestore** | Proyección de solo lectura: agregados, estado de vigías, trazas saneadas | Fase 6 sin exponer PostgreSQL a internet |
| **App Check** | Atestación de los endpoints de la demo pública | 4C-B: agotamiento por tráfico anónimo |
| **Cloud Storage** | Subida del corpus con quién y cuándo | 4C-E: solo orígenes autorizados, registro de procedencia |
| **Emulator Suite** | Pruebas de las reglas de Firestore en CI | Criterio de aceptación de la fase 6 |

**No, y por qué:**

- **Firestore como estado conversacional o almacén de telemetría.** El costeo, el
  reparto del enrutador y el punto de equilibrio son agregaciones relacionales
  sobre decenas de miles de eventos. Eso es SQL. Además, meter conversaciones en
  un servicio alojado contradice frontalmente la regla 3 del preámbulo.
  PostgreSQL se queda donde está.
- **Remote Config para umbrales o política de enrutamiento.** Tentador y
  equivocado: convierte la configuración en un canal mutable fuera del control de
  versiones. Los umbrales viven en `config/` versionado, donde cada cambio tiene
  diff, autor y fecha. Un umbral que puede cambiar sin dejar rastro no es
  auditable.
- **Cloud Functions para el webhook.** El webhook necesita Redis para el debounce
  y responde en el mismo plano que el núcleo. Si algún día hace falta escalarlo,
  Cloud Run, no Functions — pero no en este proyecto.

---

## 4. Protocolo de git y GitHub

**Ramas.** `main` protegida. Una rama por fase: `fase/0-telemetria`,
`fase/1-whatsapp`, etc. Un PR por fase. *Squash merge*. Etiqueta `v0.N` al
cerrar. La rama es la unidad de retroceso: si una fase no pasa sus criterios, se
descarta la rama entera, no se parchea `main`.

**Protección de `main`.** Merge bloqueado si no pasan los checks de CI. Sin
push directo. Historial lineal.

**Plantilla de PR** — `.github/pull_request_template.md` con la lista de criterios
de aceptación de la fase como casillas, más dos campos obligatorios: *qué quedó
fuera y por qué*, y *qué invariante toca este PR*. Esto convierte la «definición
de terminado» del manual en un formulario que hay que llenar.

**Un solo commit por fase en `main`**, con el número de fase en el mensaje. En la
rama, tantos como haga falta.

**Issues** para el desbordamiento de alcance. Cuando el agente detecta algo que
pertenece a otra fase, en lugar de `docs/pendientes.md` abre un issue con la
etiqueta de la fase destino. Se pierde menos y se puede cerrar desde el commit.

**Dependabot** activado, con la regla del manual: cada dependencia nueva se
propone y se aprueba. Dependabot solo actualiza lo que ya existe.

**Secret scanning con push protection** desde el primer commit. Es la mitad de la
sección H de la fase 4C, gratis y desde el día uno.

---

## 5. Los invariantes, como comprobaciones que bloquean el merge

Esta es la pieza que más cambia respecto al plan original. Los invariantes en
`CLAUDE.md` son contexto para el agente; estos son mecanismo.

| # | Invariante | Comprobación | Fase en que se activa |
|---|---|---|---|
| 4 | Ningún dominio importa un SDK de proveedor | `dependency-cruiser`: `src/core/**` no puede importar `src/providers/**` ni `openai`/`@anthropic-ai`/`ollama` | 0 |
| 5 | Toda ruta emite su evento | Arnés de pruebas que envuelve el emisor y falla si un caso termina con cero o con más de un evento | 0 |
| — | Sin `any` | `tsc --strict --noEmit` + `@typescript-eslint/no-explicit-any` en `error` | 0 |
| — | Sin credenciales en el repo | `gitleaks` en CI + push protection de GitHub | 0 |
| — | Nadie consulta sin filtro de contacto | Lint: `pg`/`sql` solo puede importarse dentro de `src/repos/**`, y toda función exportada de `repos` recibe `AlcanceContacto` como primer argumento | 1 |
| 3 | Nada sale a un destino no declarado | El cliente HTTP de salida está en un único módulo con lista blanca; lint prohíbe `fetch`/`undici` fuera de él | 3 |
| — | Ninguna cifra inventada en el panel | Los datos de demostración viven solo en `panel/src/demo.fixtures.ts`; lint prohíbe importarlo fuera del modo demo, y activar ese módulo **renderiza la banda de demostración automáticamente** | 6 |

Esa última merece un párrafo. En la maqueta actual, la banda «datos de
demostración» es una decisión de diseño que alguien puede borrar. Con este
mecanismo la banda es una consecuencia de qué fuente de datos está conectada:
no se puede tener cifras falsas sin la etiqueta, porque la misma bandera controla
las dos cosas. Es la diferencia entre una promesa y una garantía.

Los invariantes 6 y 7 (determinismo, todo umbral con vigía) no son mecanizables
en CI; se verifican con las pruebas de disparo de cada vigía, en su fase.

---

## 6. Redistribución de la fase 4C

El principio rector de 4C es correcto —la contención vence a la detección— pero
el documento coloca la contención al final. Estas son las secciones y su fase
natural:

| Sección de 4C | Va a | Motivo |
|---|---|---|
| **A.** Firma, repetición, esquema de carga | **Fase 1** | El webhook y la cola nacen ahí; «antes de encolar nada» solo se puede cumplir escribiéndolo con el encolado |
| **B.** Límite de tasa, techos de tamaño | **Fase 1** | Se aplican en el borde |
| **B.** Presupuesto por contacto, tiempo máximo por caso | **Fase 4B‑1** | Son umbrales con vigía |
| **C.** Procedencia y delimitación del contenido externo | **Fase 3** | El adaptador es quien arma la petición al modelo |
| **C.** Destinatario fijado por el sistema | **Fase 5** | Es la firma de las herramientas, no un filtro |
| **C.** Detector de secuestro | **Fase 4C** | Segunda línea, correcto donde está |
| **D.** Filtro de contacto en el repositorio | **Fase 1** | La capa de repositorio nace en la 1 y crece en la 5 |
| **E.** Envenenamiento del índice | **Fase 4C**, con gancho en la 2 | La ingestión deja el punto de extensión; el detector llega después |
| **F.** Lista blanca de salida | **Fase 3** | Todos los puntos de llamada externos existen al terminar la 3 |
| **G.** Acceso administrativo | **Fase 6** | Nace con el panel, con Firebase Auth |
| **H.** Secretos | **Fase 0** | Escaneo en CI desde el primer commit |
| **I.** Respuesta graduada | **Fase 4C** | Orquesta todo lo anterior |

Escritas en su fase natural, estas restricciones son entre veinte y cincuenta
líneas cada una. Retrofiteadas en 4C son un refactor de la capa de repositorio y
del webhook con cuatro fases de código y de pruebas encima.

---

## 7. Secuencia

| Fase | Nombre | Sesiones | Depende de |
|---|---|---|---|
| **0** | Contrato de datos, telemetría, costeo, andamiaje | 2–3 | — |
| **1** | Canal Telegram endurecido y aislamiento en repositorio | 3–4 | 0 |
| **2** | Corpus y base de conocimiento con citación | 2–3 | 0 |
| **3** | Enrutador local/nube y frontera de salida | 3–4 | 1, 2 |
| **3B** | Segundo canal — prueba de la abstracción | 1 | 3 |
| **4** | Salida estructurada con procedencia, validación y escalado | 3 | 3 |
| **4B‑1** | Vigías que detienen: presupuesto, perímetro, bucle | 2 | 4 |
| **4B‑2** | Vigías que observan: sustento, proveedor, vigencia, cola, silencio | 2–3 | 4B‑1 |
| **4C** | Detección: secuestro, envenenamiento, secretos, respuesta graduada | 2–3 | 4B‑1 |
| **5** | Acciones, idempotencia, interfaz CRM | 2–3 | 4 |
| **6** | Panel sobre histórico real, un modo | 3–4 | 4B‑2, 5 |
| **7** | Lote de casos y corredor tri‑modo | 2–3 | 6 |
| **6B** | Selector de modo y calculadora de punto de equilibrio | 1–2 | 7 |
| **8** | Despliegue, operación y demo pública | 2 | 6B |
| **9** | Vigía de fallas e informe de salud | 2–3 | 8 |
| **10** | Canal de voz — opcional | 3+ | 8 |

Total hasta demo pública publicable: **fases 0 a 8**, del orden de 30 a 38
sesiones. Las fases 9 y 10 son mejora, no requisito.

Tres movimientos merecen justificación:

- **El canal primario es Telegram, no WhatsApp** (R‑020). WhatsApp Business exige
  un número corporativo y una revisión de Meta que puede tardar semanas; un bot de
  Telegram se crea en dos minutos. Con WhatsApp en la fase 1, todo el proyecto
  quedaba detrás de un trámite ajeno. WhatsApp pasa a ser un **conector
  declarado** que se activa cuando existan sus credenciales.
- **3B sube desde la fase 8 y deja de ser «Telegram».** El criterio de aceptación
  de la fase 1 —«el núcleo no importa nada específico del canal»— hoy se
  verificaría leyendo código. La única verificación real es un **segundo** canal, y
  son unas cien líneas sobre la interfaz `Canal`. Enterrado al final, ese criterio
  pasa siete fases sin probarse, que es tiempo de sobra para que el núcleo acumule
  dependencias que nadie nota. Cuál sea ese segundo canal se decide en §7 bis.
- **7 se ejecuta antes que 6B.** El selector de modo del panel exige «la misma
  carga de trabajo bajo los tres despliegues con las cifras recalculadas», y
  ejecutar la misma carga contra los tres modos *es* el corredor de la fase 7.
  Tal como estaba, la fase 6 no podía cumplir su propio criterio de aceptación.
- **9 (informe de salud) sale del camino crítico.** Es una herramienta de
  desarrollo excelente, no un freno del producto. Nada de la demo pública depende
  de ella.

### 7 bis. Cuál es el segundo canal, y por qué no puede ser WhatsApp

Sacar WhatsApp de la fase 1 desbloquea el proyecto, pero **abre un agujero**: la
fase 3B existe para demostrar que la abstracción `Canal` funciona, y esa
demostración necesita un segundo canal que se pueda construir. Si el segundo canal
fuera WhatsApp, el criterio quedaría detrás del mismo trámite que acabamos de
apartar del camino crítico — y un criterio que depende de una autorización externa
es un criterio que puede no cumplirse nunca.

El segundo canal es **`lote`**, un adaptador que alimenta casos desde archivos a
través de la misma interfaz `Canal`. Tres razones:

1. **No depende de nadie.** Ni número corporativo, ni revisión, ni token de
   terceros. Se puede construir el mismo día que se decide.
2. **Ya está en el contrato de datos.** `canal ∈ {whatsapp, telegram, voz, lote}`
   desde la fase 0. No inventa una categoría: usa una que el esquema ya declara.
3. **La fase 7 lo necesita de todos modos.** El corredor tri‑modo tiene que meter
   cincuenta o cien casos por el sistema. Si lo hace por la interfaz `Canal` en vez
   de por un atajo, el lote ejercita **el camino real** —debounce, normalización,
   alcance de contacto— en lugar de uno paralelo que puede divergir sin que nadie
   se entere. Construirlo en la 3B no es trabajo extra: es adelantar trabajo de la
   7 al momento en que además sirve de prueba.

WhatsApp, cuando llegue, será el **tercer** canal. Ahí la prueba será más fuerte
todavía: un canal comercial con firma criptográfica, cuotas y formatos propios,
entrando sin tocar `src/core/`. Pero el proyecto no se queda esperándolo.

---

## 8. Las fases

### Fase 0 — Contrato de datos, telemetría, costeo, andamiaje

**Objetivo.** Que el sistema pueda medirse y que las reglas se defiendan solas
antes de que exista algo que medir.

**Construir.**

- Repositorio con estructura por dominio:

  ```
  perimetro/
    .github/workflows/ci.yml
    .github/pull_request_template.md
    CLAUDE.md
    config/            precios, umbrales, política de enrutamiento
    docs/
    migrations/
    src/
      core/            enrutador, validación, costeo, vigías
      channels/
      providers/
      repos/           única capa con acceso a SQL
      telemetry/
    panel/
    proyeccion/        publicador perímetro → Firestore
    lote/
    tests/
  ```

- **Esquema del evento de telemetría, con el enum desdoblado.** Este es el cambio
  que evita que el panel se contradiga:

  - `resultado ∈ {resuelto, escalado_humano, descartado, bloqueado}`
  - `desvio_ejecucion ∈ {ninguno, local_a_nube, nube_a_local}` con su motivo
  - `destino_ejecucion`, `clase_tarea`, `clase_sensibilidad`, `hubo_egreso`,
    `latencia_ms`, `tokens_entrada`, `tokens_salida`, `costo`, `motivo_decision`,
    `fuentes[]`, `caso_id`, `canal`

  En el plan original ambos escalados caían en un único valor `escalado`. Contar
  sobre ese campo produce dos cifras distintas para lo mismo, que es exactamente
  el defecto que aparece en la maqueta del panel.

- Tabla de precios por modelo en `config/precios.json`.
- Migraciones de PostgreSQL: `conversaciones`, `mensajes`, `eventos`,
  `prospectos`, `contactos`.
- **Función de costeo pura, fuente única.** Para ejecución local: tarifa horaria
  de hardware amortizado más energía, prorrateada por tiempo de cómputo. Devuelve
  el costo **y los supuestos que usó** (equipo, vida útil, utilización asumida),
  porque el panel tiene que mostrarlos junto al número.
- CI en GitHub Actions con los checks de la sección 5.

**Criterios de aceptación.**

- Existe una prueba que falla si una ruta de ejecución termina sin emitir evento,
  y otra que falla si emite dos.
- La función de costeo tiene pruebas para nube, local e híbrido.
- Cambiar un precio en `config/` cambia los totales sin tocar código.
- **La función de costeo es la única fuente de costo del sistema.** Un lint falla
  si aparece aritmética de precios fuera de ese módulo. La calculadora de la fase
  6B la importará, no la reimplementará.
- El check de arquitectura falla si se añade un `import` de un SDK de proveedor
  dentro de `src/core/`. Demuéstralo añadiéndolo y viéndolo fallar.
- `gitleaks` corre en cada PR.

**Qué no se hace aquí.** Nada que responda a un usuario.

---

### Fase 1 — Canal Telegram endurecido y aislamiento en repositorio

**Objetivo.** Entrada por un canal, normalizada, encolada y ya defendida. Absorbe
4C‑A, 4C‑B (borde) y 4C‑D.

**Por qué Telegram y no WhatsApp** (R‑020). WhatsApp Business exige número
corporativo y revisión de Meta. Telegram exige hablar con `@BotFather` y guardar un
token. Nada de esta fase es específico de un canal salvo el adaptador: la firma, la
repetición, el límite de tasa, el debounce, la normalización y el alcance de
contacto son los mismos. Cambiar de canal primario cambia unas cien líneas, no la
fase.

**Construir.**

- Webhook de Telegram. **Primero la verificación del secreto**, con comparación en
  tiempo constante, antes de encolar o de tocar nada. Telegram lo entrega en la
  cabecera `X-Telegram-Bot-Api-Secret-Token`, fijada al registrar el webhook.
  Después la respuesta inmediata al proveedor.

  > El criterio no cambia con el canal: **una petición sin credencial válida no
  > llega a la cola**. Lo que cambia es el mecanismo — Telegram usa un secreto
  > compartido, WhatsApp una firma HMAC. Por eso la verificación vive en el
  > adaptador, detrás de un método de la interfaz `Canal`, y no en el webhook.

- Rechazo de repetición: ventana de marca de tiempo más registro de identificadores
  de mensaje ya vistos en Redis. Telegram reenvía la actualización si el webhook
  no responde `200` a tiempo, así que esto no es teórico.
- Validación estricta de la carga útil contra esquema; lo que no valida se
  descarta sin procesar y se registra.
- Límite de tasa por contacto y por dirección de origen, ventana deslizante.
  Techos de tamaño de mensaje y de adjunto.
- Encolamiento en Redis con ventana de agrupación configurable.
- Normalización a mensaje canónico: remitente, contenido, tipo, adjuntos, marca
  de tiempo, **procedencia**.
- Interfaz `Canal` con recibir, responder y **verificar la credencial de entrada**.
  Los tres métodos son lo único que un canal nuevo tiene que implementar.
- **Conector de WhatsApp declarado, no construido.** Aparece en el registro de
  canales como `no_configurado`, con la lista de lo que necesita para activarse:
  cuenta de WhatsApp Business, número verificado, aplicación de Meta, token
  permanente, URL de webhook y token de verificación. Al arrancar sin esas
  credenciales **no se registra y lo dice en el arranque**; no falla en silencio ni
  finge estar disponible. Ver §Fase 3B.
- **Capa `src/repos/` con alcance de contacto obligatorio.** Ninguna función
  exportada puede construirse sin un `AlcanceContacto`. Es la única capa del
  sistema que importa el cliente de PostgreSQL.

**Criterios de aceptación.**

- Cinco mensajes en tres segundos producen una sola ejecución.
- El núcleo no importa nada específico de Telegram — verificado por el check de
  arquitectura, no por lectura.
- Reiniciar el proceso no pierde la conversación en curso.
- **Una petición sin credencial válida nunca llega a la cola.** Prueba explícita.
- **El conector de WhatsApp arranca sin credenciales sin romper nada, y declara
  qué le falta.** Prueba explícita: el registro de canales lo lista como
  `no_configurado` con sus requisitos, y ninguna ruta puede enviarle un mensaje.
- **Un mensaje repetido no produce una segunda ejecución.** Prueba explícita.
- **Existe una prueba que falla si algún método de `repos/` puede consultar sin
  filtro de contacto.**
- Un mensaje que excede el techo de tamaño se rechaza en el borde y queda
  registrado.

---

### Fase 2 — Corpus y base de conocimiento con citación

**Objetivo.** Que el agente solo pueda hablar de lo documentado. Empieza con un
entregable que el plan original mencionaba solo como riesgo.

**Construir.**

- **El corpus de la empresa ficticia**, como entregable con nombre: entre quince
  y treinta documentos reales de una clínica —servicios, precios, horarios,
  políticas de cancelación, preguntas frecuentes, cobertura de seguros—. Bloquea
  esta fase y también la 7, donde los casos se escriben contra él.
- Ingestión desde carpeta vigilada y desde Cloud Storage: PDF, TXT, Markdown,
  registrando quién subió cada documento y cuándo.
- Suma de verificación por documento.
- Troceado con solapamiento, embeddings, carga en Qdrant con documento de origen,
  página o sección y fecha de ingestión.
- Recuperación con puntuación y referencia. Umbral configurable; por debajo,
  vacío explícito.
- Reingestión idempotente.
- **Gancho de validación previa a la vectorización**, sin implementar todavía: el
  punto donde la fase 4C enchufará el detector de envenenamiento.

**Criterios de aceptación.**

- Una pregunta cuya respuesta no está en los documentos devuelve vacío, no un
  fragmento forzado.
- Toda respuesta recuperada trae su referencia de origen.
- Los embeddings se generan local o en nube según configuración, sin tocar el
  código de recuperación.
- Reingerir el mismo documento dos veces no duplica fragmentos.
- Un documento modificado fuera del flujo de ingestión dispara alerta de suma de
  verificación.

---

### Fase 3 — Enrutador local/nube y frontera de salida

**Objetivo.** El corazón del proyecto. Absorbe 4C‑C (delimitación) y 4C‑F.

**Construir.**

- Clasificador de tarea determinista: saludo, catálogo, extracción, agendamiento,
  queja, ambiguo.
- Clasificador de sensibilidad: datos personales propios o de terceros.
- Política de enrutamiento en `config/politica.json`, declarativa, con la regla
  dura: sensibilidad alta nunca sale del perímetro.
- Capa de saneo que enmascara identificadores antes de cualquier llamada externa
  y los restituye en la respuesta.
- Adaptadores tras interfaz común: Ollama local y un proveedor de nube.
- **Todo contenido de origen externo se entrega al modelo como dato delimitado,
  con su procedencia, nunca concatenado en la zona de instrucciones.** El armado
  de la petición vive en el adaptador y es lo único que puede construirla.
- **Módulo único de salida con lista blanca de destinos.** El lint prohíbe
  `fetch` fuera de él. Sin esto, una inyección exitosa convierte el agente en el
  mensajero del atacante.
- Respaldo controlado con tiempo máximo, registrado como `desvio_ejecucion`,
  nunca como `escalado_humano`.
- Cada decisión de enrutamiento registrada con motivo legible.

**Criterios de aceptación.**

- Una petición marcada como sensible jamás produce una llamada externa. Prueba
  explícita con espía sobre el módulo de salida.
- **Una llamada a un dominio no declarado se bloquea aunque el código la
  intente.** Prueba explícita.
- Cambiar la política en configuración cambia el destino sin recompilar.
- El registro permite reconstruir por qué cada petición fue donde fue.
- Un desvío de local a nube aparece en telemetría como desvío, no como escalado a
  humano.

---

### Fase 3B — Segundo canal y conector de WhatsApp

**Objetivo.** Convertir el criterio de aceptación de la fase 1 en una prueba de
verdad, y dejar WhatsApp listo para enchufarse el día que existan sus credenciales.
Sesión corta.

**Construir.**

- **Adaptador de `lote`** sobre la interfaz `Canal`: alimenta casos desde archivos
  por el mismo camino que Telegram — debounce, normalización, alcance de contacto—.
  Razonado en §7 bis. Es también el cimiento del corredor de la fase 7.
- **Conector de WhatsApp, completo salvo credenciales.** Verificación de firma
  HMAC, normalización de su formato de carga y envío por la API de mensajes, todo
  escrito y probado contra cargas de ejemplo del propio proveedor. Lo que no tiene
  es cuenta.
- **Declaración de requisitos legible por la aplicación**, no un párrafo en un
  README: qué necesita el conector para activarse, en qué variable de entorno va
  cada cosa, y cómo se obtiene. El panel de la fase 6 la lee para mostrar el estado
  del conector y qué falta; hasta entonces se ve al arrancar y por línea de órdenes.

**Criterios de aceptación.**

- Añadir un canal no modifica ni una línea de `src/core/`. Verificable con el diff
  del PR y con el check de arquitectura.
- El mismo caso entrando por Telegram y por `lote` produce eventos idénticos salvo
  el campo `canal`.
- **El conector de WhatsApp declara sus requisitos y el sistema arranca sin ellos.**
  Con credenciales inventadas en un entorno de prueba, la verificación de firma
  acepta una carga de ejemplo firmada correctamente y rechaza una alterada.
- **Ninguna cifra del panel cuenta casos de un canal no configurado.** Un conector
  declarado no es un canal activo, y confundirlos inflaría el denominador.

---

### Fase 4 — Salida estructurada con procedencia, validación y escalado

**Objetivo.** Que ninguna respuesta sin respaldo llegue al cliente. Aquí se toma
la decisión de diseño más importante del proyecto.

**La decisión.** El plan pedía un verificador que «comprueba que cada afirmación
esté respaldada por un fragmento» — eso es inferencia de lenguaje natural, y las
dos implementaciones obvias violan reglas del preámbulo: un modelo verificador
rompe la regla 7, y el solapamiento léxico produce una puntuación que no
significa nada.

La vía que resuelve la tensión: **el modelo no escribe prosa que luego se audita.
Emite una estructura donde cada dato lleva su `fragmento_id`.** El verificador
comprueba tres cosas, todas deterministas:

1. que el `fragmento_id` existe,
2. que ese fragmento se recuperó **en esta ejecución**,
3. que el valor citado aparece literalmente en el fragmento.

La redacción final se compone en código a partir de la estructura verificada. La
puntuación de sustento pasa de ser una estimación a ser una proporción contable:
campos con procedencia válida sobre campos totales. El modelo redacta; el código
decide. Regla 6, al pie de la letra.

**Construir.**

- Esquemas de salida por clase de tarea, con `fragmento_id` obligatorio por campo
  factual.
- Solicitud de salida estructurada al proveedor y validación contra el esquema.
- Verificador de procedencia con las tres comprobaciones.
- Umbrales: por encima se envía; en zona intermedia se envía con matiz de
  incertidumbre; por debajo se escala.
- Reintento único con contexto corregido antes de escalar.
- Cola de escalado con motivo, transcripción y contexto, más notificación al
  operador.

**Criterios de aceptación.**

- Una respuesta que afirma algo ausente de las fuentes se bloquea, no se envía.
- Una respuesta con un `fragmento_id` que no se recuperó en esa ejecución se
  bloquea. Prueba explícita — es el caso de alucinación de cita.
- Un fallo de validación de esquema nunca llega al usuario y siempre se registra.
- El caso escalado conserva el hilo completo.

---

### Fase 4B‑1 — Vigías que detienen

**Objetivo.** Los tres frenos sin los cuales no se puede exponer nada al público.

**Construir.**

- **Vigía de presupuesto.** Techo por conversación, por hora, por día y **por
  contacto** (esto último venía de 4C‑B). Umbral suave: degrada todo a modelo
  local. Umbral duro: detiene las llamadas de nube y responde con mensaje de
  contingencia.
- **Vigía de perímetro.** Contador de egreso de sensibilidad alta. Umbral cero,
  acción detener. Registra numerador **y denominador**: casos clasificados como
  sensibilidad alta, y de esos cuántos se retuvieron.
- **Vigía de bucle.** Límite duro de pasos, de llamadas a herramientas y de
  reintentos por caso, más tiempo máximo de procesamiento con cancelación
  (de 4C‑B). Corta y escala.

**Criterios de aceptación.**

- Cada uno tiene una prueba de inyección de fallo que demuestra que dispara. Un
  vigía sin prueba de disparo es decoración.
- Los tres pueden **detener**, no solo avisar.
- Toda actuación queda registrada como evento con umbral, valor observado y
  acción tomada.
- Ninguno depende de una llamada a un modelo para decidir.
- **El vigía de perímetro expone su denominador.** Un contador en cero con
  denominador cero no prueba nada; el panel tiene que poder mostrar «31 de 31
  retenidos».

---

### Fase 4B‑2 — Vigías que observan

**Construir.** Sustento, proveedor, vigencia, cola y silencio, según la
especificación original de la fase 4B. El de silencio es el único que detecta
ausencia de señal en vez de exceso, y por eso necesita conocer el tráfico
esperado por franja.

**Criterios de aceptación.** Los mismos cuatro genéricos de 4B‑1, aplicados a cada
uno. Más: el vigía de sustento se prueba vaciando el índice de Qdrant y
comprobando que avisa y marca el índice como sospechoso, no que el agente
«empeoró».

---

### Fase 4C — Detección

**Objetivo.** La segunda línea. Lo que queda tras haber bajado las restricciones
estructurales a sus fases.

**Construir.**

- Detector de patrones de secuestro: texto que ordena ignorar reglas, cambia el
  rol del agente, pide la configuración del sistema o datos de otro contacto.
  Acción: no obedecer, responder con normalidad, registrar el intento íntegro,
  elevar la vigilancia de ese contacto.
- Detector de envenenamiento enchufado al gancho que dejó la fase 2: los
  documentos pasan por él **antes** de vectorizarse.
- Verificación de salida por aislamiento: si una respuesta contiene datos que no
  pertenecen al contacto de la conversación, se bloquea y se marca como incidente
  grave.
- Filtro de fuga sobre la respuesta: nada de configuración, credenciales, rutas
  internas ni trazas.
- Vigilancia de caducidad de credenciales, enlazada con el `401` del vigía de
  fallas de la fase 9.
- **Respuesta graduada**: observar, limitar, poner en cuarentena, detener el
  canal. Cuarentena en vez de bloqueo permanente, para no dejar fuera a un
  cliente real por un falso positivo.
- Registro de incidentes de seguridad **sin agrupar**, uno a uno.

**Criterios de aceptación.**

- Un documento con instrucciones incrustadas no altera el comportamiento del
  agente con otros usuarios. Prueba con dos contactos.
- Todo incidente de seguridad queda registrado íntegro y visible en el panel con
  su nivel de respuesta.
- Un falso positivo lleva a cuarentena, no a bloqueo; existe la ruta de
  reactivación por un humano.

---

### Fase 5 — Acciones, idempotencia, interfaz CRM

**Construir.** Lo del plan original, más 4C‑C estructural:

- Herramientas: crear prospecto, consultar disponibilidad, agendar cita, enviar
  confirmación.
- **Ninguna herramienta acepta el destinatario desde el texto.** El agente solo
  puede actuar sobre el contacto de la conversación en curso, y el destinatario lo
  fija el sistema. Es una restricción de la firma de la función, no un filtro.
- Interfaz `CRM` de tres métodos con PostgreSQL por defecto y adaptadores
  externos. No se construye un CRM: ni embudos, ni permisos, ni reportes, ni
  importadores.
- Recolección progresiva de datos, campo a campo, sin perder lo capturado.
- Idempotencia por clave de operación, con registro antes y después.
- Confirmación explícita antes de cualquier acción irreversible.

**Criterios de aceptación.**

- Ejecutar dos veces la misma acción no crea dos citas.
- **Ninguna herramienta puede recibir un destinatario que no sea el contacto en
  curso.** Prueba con un mensaje que intenta indicar otro número.
- El sistema funciona de principio a fin sin ninguna cuenta de CRM externa.
- Añadir un proveedor de CRM es escribir un adaptador.
- Si el agente pierde el hilo y vuelve, los datos capturados no se vuelven a
  pedir.

---

### Fase 6 — Panel sobre histórico real

**Objetivo.** La pieza que vende, con datos de un solo modo. El selector de modo
llega en 6B, cuando la fase 7 lo haga posible.

**Construir.**

- Publicador en `proyeccion/`: lee PostgreSQL dentro del perímetro y escribe la
  proyección en Firestore. Solo agregados, estado de vigías y trazas saneadas.
  **Pasa por la misma capa de saneo que las llamadas externas.**
- Reglas de Firestore: escritura solo desde el Admin SDK; los clientes solo leen.
- Firebase Auth para operadores, con *custom claims* de dos roles: métricas
  agregadas, y trazas con contenido. Ver lo primero no implica ver lo segundo.
- Registro de todo acceso al panel, **incluido el de lectura**.
- Panel en Hosting, con la jerarquía del plan: costo por caso resuelto, resueltos
  sin intervención, tiempo de primera respuesta, escalados y su motivo.
- Registro de egreso por clase de sensibilidad, con numerador y denominador.
- Vista de traza por caso: cadena de decisión, fuentes citadas, decisión del
  enrutador, resultado de validación, costo.
- Estado de vigías con umbral, valor actual, autoridad y última actuación.
- **Los supuestos del costeo local visibles junto al número.** «$0.004 por caso,
  RTX 4090 amortizada a tres años al 40 % de utilización» es creíble; «$0.004» a
  secas invita a una pregunta sin respuesta.

**Criterios de aceptación.**

- Toda cifra del panel se rastrea hasta eventos reales en PostgreSQL.
- **Dos métricas que cuenten lo mismo se derivan del mismo campo.** Prueba de
  reconciliación: escalados a humano del KPI = escalados a humano del reparto.
- El panel funciona sin datos en vivo, leyendo el histórico.
- **Una prueba en el emulador de Firebase falla si un cliente autenticado puede
  escribir en la proyección.**
- **Una prueba falla si un usuario con rol de métricas puede leer una traza con
  contenido.**
- Activar el módulo de datos de demostración renderiza la banda de demostración
  automáticamente; no hay forma de tener uno sin la otra.

---

### Fase 7 — Lote de casos y corredor tri‑modo

**Construir.**

- Lote de cincuenta a cien casos escritos a mano contra el corpus de la fase 2,
  con respuesta esperada y fuente correcta: frecuentes, ambiguos, fuera de
  alcance, intentos de sacar datos de otro cliente, instrucción inyectada, firma
  alterada, repetición de mensaje, e inyección dentro de un PDF.
- **Casos de sensibilidad alta en cantidad suficiente para que el vigía de
  perímetro tenga denominador.** Sin ellos, la afirmación central del producto
  queda sin probar.
- Corredor que ejecuta el lote contra los tres modos y guarda los resultados.
- Reporte comparativo: acierto, bloqueadas por falta de sustento, escalados,
  latencia y costo por modo.

**Criterios de aceptación.**

- El lote corre de principio a fin con un solo comando.
- Los casos fuera de alcance producen escalado, no invención.
- El lote incluye casos que hacen disparar **cada** vigía, y el reporte muestra
  cuál actuó en cada uno.
- Las cifras de la página del portafolio salen de este reporte y de ningún otro
  lugar.

---

### Fase 6B — Selector de modo y punto de equilibrio

**Construir.**

- Selector nube / local / híbrido sobre los resultados registrados por el
  corredor. Misma carga, cifras recalculadas, todas trazables.
- Vista honesta del híbrido: dónde el local no alcanzó, cuántas veces se escaló a
  la nube y cuánto costó esa corrección.
- Calculadora de punto de equilibrio con parámetros editables: volumen mensual,
  utilización, depreciación, energía, mantenimiento y escenario de precio de nube
  decreciente. **Importa la función de costeo de la fase 0; no la reimplementa.**

**Criterios de aceptación.**

- La calculadora produce la recomendación de permanecer en la nube con parámetros
  de bajo volumen.
- El costo que muestra la calculadora para un escenario dado coincide con el que
  produjo el corredor para ese mismo escenario. Prueba de consistencia entre las
  dos superficies.

---

### Fase 8 — Despliegue, operación y demo pública

**Objetivo.** La fase que el plan original no tenía. Sin ella no hay demo, solo
un repositorio.

**Construir.**

- Perímetro autoalojado: la máquina de referencia con Ollama, con PostgreSQL,
  Redis y Qdrant en contenedores. Documentada, porque de ella salen las cifras de
  costo local.
- Respaldos de PostgreSQL con prueba de restauración. Un respaldo que no se ha
  restaurado nunca no es un respaldo.
- Secretos en producción fuera del repositorio y fuera del informe de salud.
- Despliegue del panel con GitHub Actions a Firebase Hosting, disparado por
  etiqueta.
- App Check sobre los endpoints públicos.
- **Demo pública como reproducción**: sirve ejecuciones registradas del lote de
  la fase 7 desde la proyección. No consume presupuesto por visitante, no expone
  el webhook y no depende de que el perímetro esté encendido. Etiquetada como
  reproducción de ejecuciones reales, con el identificador del lote visible.

**Criterios de aceptación.**

- La demo pública no realiza ninguna llamada de inferencia.
- Un despliegue completo desde cero está documentado y se ha ejecutado una vez.
- Una restauración de respaldo se ha ejecutado y verificado.
- El webhook de producción rechaza toda petición sin firma válida — verificado
  contra el despliegue real, no solo en pruebas.

---

### Fase 9 — Vigía de fallas e informe de salud

**Construir.** El vigía de fallas y el informe según la especificación original
de la fase 4B: clasificación por significado y no por número, agrupación por
huella, informe en dos formatos con caso de reproducción saneado, encabezado con
disponibilidad, tasa de error, tiempo medio de recuperación y presupuesto de
error consumido.

**Criterios de aceptación.**

- El informe pasa por la capa de saneo. Ninguna traza, mensaje ni caso de
  reproducción contiene datos de un cliente. Prueba explícita.
- Un agente de código puede leer el informe estructurado y proponer una
  corrección sin acceso a la base de datos ni a los registros crudos.
- El informe propone; nunca aplica.

---

### Fase 10 — Voz (opcional)

Transcripción y síntesis sobre el mismo núcleo y la misma interfaz `Canal`. Para
la demo: llamada grabada con la transcripción reproduciéndose y la traza del
panel avanzando en sincronía, sin exigir número de teléfono ni registro. La
sincronía es fácil aquí porque la demo ya es una reproducción desde la fase 8.

---

## 9. Protocolo de fracaso

El plan original solo describe el camino feliz. Esto es lo que falta:

Si al **tercer intento** una fase no pasa sus criterios de aceptación, no se
sigue empujando. Se hace lo siguiente, en este orden:

1. Se anota en el PR qué criterio falla y por qué.
2. Se decide entre tres salidas: **partir la fase**, **relajar el criterio con
   justificación escrita**, o **descartar la rama** y replantear.
3. Si se relaja un criterio, queda como issue abierto con la etiqueta de la fase.
   Un criterio relajado en silencio es deuda invisible.
4. `main` no se toca. La rama es la unidad de retroceso.

Y la regla del manual que más va a costar respetar: **al cerrar una fase, se
cierra la sesión del agente**. Arrastrar el contexto de tres fases degrada las
decisiones, y en la 4C —que es la que más contexto previo parece necesitar— es
donde más daño hace.

---

## 10. Riesgos, actualizados

- **La aprobación de WhatsApp Business** puede tardar semanas y exige número
  corporativo. **Deja de ser un riesgo del camino crítico** (R‑020): el canal
  primario es Telegram y WhatsApp entra como conector cuando existan sus
  credenciales. El riesgo que queda es distinto y menor: que el conector se escriba
  contra la documentación y nadie lo ejercite nunca contra el proveedor real. Se
  mitiga probándolo con cargas de ejemplo firmadas, pero conviene no llamarlo
  «probado» hasta que haya pasado un mensaje de verdad.
- **El corpus.** Ahora es un entregable con nombre dentro de la fase 2, y bloquea
  también la 7. Si no hay documentos, no hay proyecto.
- **La máquina de referencia.** De ella salen todas las cifras de costo local. Si
  no está definida antes de la fase 6, el panel muestra números que no se pueden
  defender.
- **El verificador de procedencia de la fase 4** es el punto donde el proyecto se
  puede torcer hacia «un modelo juzgando a otro». La vía estructurada está
  decidida en este documento precisamente para que no se decida en caliente
  dentro de una sesión.
- **La cuota gratuita de Firebase** cubre holgadamente una demo de portafolio,
  pero App Check y el límite de tasa no son opcionales: un endpoint público sin
  freno es una factura esperando a ocurrir. Van en la fase 8, no después.
