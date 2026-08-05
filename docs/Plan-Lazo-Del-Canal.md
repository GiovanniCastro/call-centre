# Perímetro — Plan del lazo del canal · fase 11

> **Estado: PROPUESTO.** Nada de este documento está construido. Complementa a
> [[Propuesta-Desarrollo-Por-Fases]]; no la sustituye. La verdad única sigue
> siendo [[00-CANON]].
>
> Fecha del hallazgo: **4‑ago‑2026**. Ver [[CALL_CENTRE_DOCS]] R‑052.

---

## 1. El hallazgo

Las fases 0 a 9 están construidas y sus criterios de aceptación pasan: **473
pruebas más 6 de reglas contra el emulador**, tipos, lint y arquitectura limpios.
El perímetro arranca, conecta Redis, PostgreSQL y Qdrant, y escucha en `:8787`.
Un `POST /webhook/telegram` sin el secreto devuelve `401`. La base de
conocimiento responde con cita y puntuación. El ciclo de caso atiende, verifica
procedencia, dispara vigías y emite su evento.

Y sin embargo **el proceso que corre no responde a nadie**. Cuatro medidas, todas
tomadas contra el disco y contra la base el 4‑ago‑2026:

| Qué se comprobó | Cómo | Resultado |
|---|---|---|
| Quién usa el ciclo de caso | `grep -rl "core/caso" src/ lote/ proyeccion/` | **un solo archivo**: `src/lote/corredor.ts` |
| Si la cola se puede consumir | La interfaz `Cola` en `src/borde/cola.ts` | Declara `encolar` y `pendientes`. **No declara desencolar** |
| Quién persiste telemetría | `grep -rn "EmisorPostgres" src/` | Solo su propia definición. **Ningún punto de arranque lo instancia** |
| Cuánta telemetría hay | `select count(*) from eventos` | **0 filas** |

En una frase: **el agente existe y funciona, pero solo lo invoca el corredor del
lote.** [main.ts](../src/main.ts) monta el registro de canales, el almacén del
borde, la cola, el despachador y el servidor HTTP. No monta el agente.

Esto es lo que recorre hoy un mensaje de Telegram, y dónde se detiene:

```
verificar credencial → rechazar repetición → límite de tasa → techo de tamaño
  → normalizar → agrupar (ventana de debounce) → persistir conversación
  → despachador → cola
                    ▲
                    └── y aquí termina. Nadie desencola.
                        No hay respuesta. No hay evento.
```

El panel de operación lee una proyección derivada de la tabla `eventos`. Con esa
tabla vacía, la vista de operación no tiene de qué hablar, y lo único con
contenido es la demo por reproducción — que sí es real, pero es una corrida
grabada del lote, no tráfico.

**El invariante 5 no está en peligro**, y conviene decirlo con precisión: no hay
ninguna ruta que termine sin emitir su evento. Lo que hay es una ruta que **no
termina**.

---

## 2. Por qué no lo cubría ninguna fase

No es un descuido de una fase: es la costura entre dos, y las costuras no tienen
dueño salvo que alguien las asigne.

| Fase | Qué construyó | Qué dice su criterio de aceptación |
|---|---|---|
| 1 | El borde: firma, repetición, tasa, agrupación, persistencia | «Cinco mensajes en tres segundos producen una sola ejecución» |
| 3 y 4 | El ciclo: clasificar, enrutar, sanear, redactar, verificar | «Una respuesta que afirma algo ausente de las fuentes se bloquea» |
| 5 | Las acciones y su idempotencia | «Ejecutar dos veces la misma acción no crea dos citas» |
| 7 | El corredor que mete casos por la interfaz `Canal` | «El lote corre de principio a fin con un solo comando» |

Ninguno dice **«y el proceso que corre en producción contesta»**. La fase 7 tapó
el hueco sin querer: su corredor monta a mano las dependencias que el ciclo
necesita —vigías, planos de inferencia, recuperador— y llama a `atender`. Como el
lote sí funciona de principio a fin, el sistema parecía completo desde cualquier
sitio donde uno mirara.

Es la razón por la que este plan existe como fase propia y no como un arreglo
dentro de otra: **lo que no tiene criterio de aceptación no está terminado,
aunque todas sus piezas lo estén.**

---

## 3. Las cuatro decisiones de este plan

**Una. El montaje se comparte con el corredor; no se duplica.** Hoy `montar` vive
dentro de [ordenes.ts](../src/lote/ordenes.ts) del lote. Escribir un segundo
montaje para producción daría dos composiciones del mismo sistema, y el lote
—del que salen todas las cifras del portafolio— pasaría a medir un camino que
producción no recorre. Es el mismo razonamiento que la fase 7 aplicó a los tres
modos: «un modo con ruta propia mediría un camino que producción no recorre». El
montaje pasa a un módulo único que importan los dos.

**Dos. La cola gana lado de consumo, y pasa a Redis.** La interfaz `Cola` no
declara `desencolar`, así que el consumidor no es que falte: **no se puede
escribir**. Y `ColaEnMemoria` no es persistente, cosa que el propio arranque
avisa. El stack fijado en [[00-CANON]] ya dice Redis para colas; esto es
cumplirlo, no ampliarlo.

**Tres. El envío es idempotente por grupo.** La fase 5 hizo idempotentes las
acciones, no los envíos. Telegram reentrega si el webhook no responde a tiempo, y
el rechazo de repetición del borde cubre el mensaje de entrada — no la respuesta
de salida. Sin una clave de envío por grupo, un reintento tras un corte contesta
dos veces al cliente.

**Cuatro. La fase 11 se numera al final y se ordena la primera.** El número dice
cuándo se escribió; el orden, cuándo se hace. Va antes que 8B y que 10 porque sin
ella la demo pública sigue siendo la única superficie con datos y el panel de
operación no puede cumplir su criterio —«toda cifra se rastrea hasta eventos
reales en PostgreSQL»— por la vía que ese criterio pretendía: tráfico.

---

## 4. Secuencia

| Fase | Nombre | Sesiones | Depende de |
|---|---|---|---|
| **11A** | Montaje compartido y trabajador del ciclo | 2 | 4B‑1, 7 |
| **11B** | Respuesta por el canal, sin duplicar | 1–2 | 11A |
| **11C** | Cola persistente y ciclo de vida del proceso | 2 | 11B |
| **11D** | El panel de operación sobre tráfico real | 1 | 11C, 6 |

Total: **6 a 7 sesiones**. Después de 11D, y solo entonces, tiene sentido 8B: un
panel desplegado sobre una proyección vacía es una demo de la maqueta.

---

## 5. Las fases

### Fase 11A — Montaje compartido y trabajador del ciclo

**Objetivo.** Que un grupo encolado se convierta en un caso atendido y en una fila
de `eventos`.

**Construir.**

- **Módulo único de composición** (`src/composicion/`): construye recuperador,
  planos de inferencia, vigías y emisor a partir de la configuración, y devuelve
  las `Dependencias` que pide `atender`. Lo importan el corredor del lote y el
  trabajador de producción, y nadie más construye esas piezas a mano.
- **`desencolar` en la interfaz `Cola`**, con la semántica declarada: qué pasa con
  un grupo tomado y no confirmado.
- **Trabajador** que desencola, arma la `EntradaDeCaso` desde el grupo —contacto,
  canal, texto agrupado— y llama a `atender` **envuelto en `vigilarCaso`**, que es
  lo que convierte el invariante 5 en comprobación en la ruta viva y no solo en el
  lote.
- **`EmisorPostgres` conectado** en el arranque, con su volcado periódico. Lo que
  falla vuelve a la cola y se dice; ese comportamiento ya existe desde R‑035.
- El trabajador se puede **apagar**: sin él, el perímetro sigue arrancando y
  encolando, y lo dice al arrancar como ya hace con los canales sin configurar.

**Criterios de aceptación.**

- Un caso entrando por el canal `lote` **dentro del proceso en marcha** —no por
  `npm run lote`— produce una respuesta y **exactamente una** fila en `eventos`.
  Prueba explícita contra PostgreSQL real.
- **El corredor del lote y el trabajador construyen sus dependencias con la misma
  función.** Prueba estructural: falla si aparece un segundo sitio que instancie
  un vigía o un plano de inferencia fuera del módulo de composición.
- Un grupo que revienta a mitad **emite su evento igual** y no bloquea la cola.
- Arrancar sin trabajador no rompe nada y se anuncia.

**Qué no se hace aquí.** Ni reintentos de envío, ni persistencia de la cola. Un
trabajador que además garantiza la entrega es dos cosas a la vez, y la segunda
tiene sus propios criterios.

---

### Fase 11B — Respuesta por el canal, sin duplicar

**Objetivo.** Que la respuesta llegue al cliente una sola vez.

**Construir.**

- Envío por `Canal.responder`, con el destino **fijado por el sistema** desde el
  grupo. Nunca desde el texto: es la misma restricción de firma que la fase 5
  puso a las herramientas, aplicada al envío.
- **Clave de idempotencia de envío por grupo**, registrada antes y después, como
  las acciones de la fase 5.
- Reintento con retroceso ante fallo transitorio del proveedor, con techo. Un
  fallo definitivo escala con el hilo entero, no se pierde.
- El resultado del envío entra en el evento: una respuesta generada y no entregada
  no es un caso resuelto, y contarla como tal inflaría el KPI que decide si el
  proyecto sirve.

**Criterios de aceptación.**

- **Procesar dos veces el mismo grupo no envía dos respuestas.** Prueba explícita.
- Un fallo de entrega no se registra como `resuelto`.
- Ninguna ruta de envío acepta un destinatario que no venga del grupo. Prueba con
  un mensaje que intenta indicar otro destino.

---

### Fase 11C — Cola persistente y ciclo de vida del proceso

**Objetivo.** Que un reinicio no pierda trabajo ni lo duplique.

**Construir.**

- **Cola sobre Redis** tras la interfaz existente, con confirmación explícita y
  devolución al vencer el plazo.
- **Cancelación al apagar**: el trabajo en vuelo termina o se devuelve; el proceso
  no se cierra a mitad de un caso en silencio.
- **Tiempo máximo por caso con cancelación**, que la fase 4B‑1 ya declara para el
  vigía de bucle, aplicado ahora al trabajo de la cola.
- **Cola de veneno**: un grupo que falla N veces sale de la rotación con su motivo
  y queda visible, en lugar de girar para siempre.

**Criterios de aceptación.**

- **Matar el proceso a mitad de un caso y volver a arrancar no pierde el caso ni
  lo contesta dos veces.** Prueba explícita contra Redis real.
- Un grupo envenenado sale de la rotación y queda registrado con su motivo.
- El techo de reintentos y el plazo de confirmación viven en `config/`, no en
  código.

---

### Fase 11D — El panel de operación sobre tráfico real

**Objetivo.** Cerrar el criterio de la fase 6 por la vía que pretendía.

**Construir.**

- Publicación programada de la proyección desde el tráfico acumulado.
- **Nada de código nuevo de panel.** Si hace falta, es que la fase 6 dejó algo
  abierto y se anota como tal.

**Criterios de aceptación.**

- Un caso entrado por Telegram aparece en la proyección tras la siguiente
  publicación, y su cifra se rastrea hasta su fila en `eventos`.
- La reconciliación de la fase 6 se sostiene sobre tráfico real: escalados a
  humano del KPI = escalados a humano del reparto.
- **El vigía de perímetro publica denominador distinto de cero** o se dice que
  todavía no lo tiene. Un «0 de 0» sobre tráfico real no afirma más que sobre el
  lote.

---

## 6. Lo que este plan no arregla

**La calidad de las respuestas.** Es importante decirlo antes de empezar, porque
es lo que alguien esperará que cambie.

La corrida vigente del lote —`lote/resultados/fase-7-v1.json`, 4‑ago‑2026, modo
local— da **31 aciertos de 65**, 17 resueltos, 41 escalados y 7 casos que
revientan por plazo. Una comprobación de tres casos hecha el mismo día dio 1
acierto de 3, con 20.3 s de media. Cerrar el lazo **no mejora ninguna de esas
cifras**: las hace visibles en el panel y frente a un cliente real.

El grueso está medido y tiene dueño: gemma4 no sostiene la salida estructurada
con citas literales, y los siete casos que revientan están en el **issue #32**.
Ninguna de las dos cosas se arregla en la fase 11, y ninguna se arregla aflojando
el verificador.

Tampoco arregla que **los modos nube e híbrido nunca se hayan corrido**: sin
`ANTHROPIC_API_KEY` la comparación que justifica el proyecto sigue sin existir, y
el vigía de perímetro sigue siendo vacuo en local — ver R‑032.

---

## 7. Riesgos

- **Que el montaje compartido se quede a medias.** Si el trabajador acaba
  construyendo «casi» lo mismo que el corredor, el lote deja de medir producción
  sin que nadie lo note. Por eso el criterio de 11A es una prueba estructural y no
  una revisión de código.
- **Que cerrar el lazo exponga el 63 % de escalados a un cliente real.** No es un
  defecto del plan: es la medición saliendo de la sombra. Conviene decidir antes
  qué contesta el agente cuando escala, y ese texto es de la fase 4.
- **Que la cola de Redis reintroduzca la duplicación** que el borde ya resuelve
  para la entrada. Son dos deduplicaciones distintas y hay que probarlas por
  separado.
- **Que se aproveche para meter alcance.** Nada de este plan necesita un canal
  nuevo, un modelo nuevo ni una tabla nueva. Lo que aparezca se abre como issue.

---

## 8. Protocolo de fracaso

El de siempre, [[Propuesta-Desarrollo-Por-Fases]] §9: al tercer intento sin pasar
los criterios se anota qué falla, se elige entre partir la fase, relajar el
criterio por escrito o descartar la rama, y **`main` no se toca**. Un criterio
relajado en silencio es deuda invisible — que es exactamente lo que este
documento acaba de encontrar en otra forma.
