# 🧬 TRASPLANTE — lo que traemos del proyecto de referencia

> Piezas de arquitectura, disciplina y candados que ya existen, funcionan y están
> pagados con incidentes reales en el proyecto de trading. No son inspiración: son
> código y reglas que se copian cambiando los nombres del dominio.
>
> Estado: **PROPUESTO**. Ninguna pieza está aplicada todavía a
> [[Propuesta-Desarrollo-Por-Fases]]. Ver §9 para los cambios concretos que exige.

---

## 0. Resumen — qué se trae y a dónde va

| Pieza | Qué resuelve en Perímetro | Fase destino |
|---|---|---|
| **Acta de caso** (`cycleJournal`) | La vista de traza de la fase 6 y el reporte de la 7 | 0 |
| **Contratos de fase** (`phaseContracts`) | Detectar que una fase corrió sin sus insumos | 0 |
| **Puerta única de salida** (`outputGateway`) | Unifica invariantes 2, 3 y la lista blanca en un solo cuello | 3 |
| **Modo sombra antes de enforcement** | Que ningún vigía bloquee sin calibrar | 4B‑1, 4B‑2, 4C |
| **`null` ≠ `OK`** | El agujero del `0 de 0` del panel | Invariante nuevo |
| **Detector de ausencias** | El fallo que no se queja; mejora el vigía de silencio | 4B‑2 |
| **Registro de vigías con autoridad** | Fase 4B entera, ya implementada | 4B‑1 |
| **Regla del contacto** (regla del ticker) | La restricción estructural de 4C‑C, con su bug ya pagado | 1, 5 |
| **Candados que barren el código** | Los checks ⚙️ de CI, mejor hechos de lo que los propuse | 0 y siguientes |
| **Memoria con `topicKey`** | La agrupación por huella de la fase 9 | 9 |
| **Núcleo puro con reloj inyectado** | Corredor determinista de la fase 7 | 0 |
| **Bitácoras desde datos** | Informe de salud y parte diario | 9 |

---

## 1. El harness — es el 70 % de lo que a Perímetro le falta

El plan de harness del proyecto de referencia es casi un calco de lo que Perímetro
necesita, con los nombres cambiados. Cuatro piezas.

### 1.1 Acta de caso

Un registro estructurado por cada evaluación, con todas las fases y lo que pasó en
cada una: fuentes usadas, calidad del dato, resultado, causa. En Perímetro:

```json
{
  "casoId": "2026-08-14T14:22_CONTACTO-EJEMPLO",
  "canal": "whatsapp",
  "fases": {
    "recepcion":    { "ok": true, "firma": "VALIDA", "repetido": false },
    "clasificacion":{ "ok": true, "tarea": "AGENDAMIENTO", "sensibilidad": "MEDIA" },
    "recuperacion": { "ok": true, "fragmentos": 3, "puntuacionMax": 0.81, "fuente": "QDRANT" },
    "enrutamiento": { "ok": true, "destino": "LOCAL", "motivo": "TAREA_SIMPLE_SENS_MEDIA" },
    "generacion":   { "ok": true, "proveedor": "OLLAMA", "esquema": "AGENDAMIENTO_V1" },
    "validacion":   { "ok": true, "sustento": 1.0, "camposConProcedencia": 4, "camposTotales": 4 },
    "respuesta":    { "accion": "ENVIADA", "causa": "SUSTENTO_ALTO" }
  },
  "degradaciones": ["EMBEDDINGS_DESDE_CACHE"],
  "resultadoRef": null
}
```

**No sustituye al evento de telemetría de la fase 0, lo complementa.** El evento
dice *qué pasó*; el acta dice *con qué insumos y en qué estado corrió cada fase*.
Sin el acta, la vista de traza de la fase 6 se reconstruye leyendo registros de
texto, y el reporte comparativo de la fase 7 no se puede escribir.

Persistencia: rotación mensual, sin poda mientras el lote sea evidencia.
Endpoint de solo lectura para el panel.

### 1.2 Contratos de fase

Cada fase declara qué insumos son **obligatorios** y cuáles **degradables**. En
sombra anota violaciones; en enforcement, un insumo obligatorio ausente termina el
caso con causa explícita — **nunca «continuar con lo que haya»**.

El incidente que lo justifica en el proyecto de referencia es el mejor argumento
para adoptarlo: un componente grabó **32 de 32 observaciones con el flujo vacío
durante semanas** y nadie se enteró, porque cada registro por separado parecía
normal.

El equivalente en Perímetro está a la vista: el clasificador de sensibilidad
devolviendo `BAJA` quinientas veces porque un patrón nunca compiló. Todo funciona,
nada se pone rojo, y el invariante 3 lleva un mes sin proteger nada. Un contrato
—«la fase de enrutamiento exige una clase de sensibilidad calculada, no
por defecto»— lo grita el primer día.

### 1.3 Puerta única de salida

Esto **mejora lo que ya escribimos**. En [[Propuesta-Desarrollo-Por-Fases]] la
lista blanca cubre solo llamadas HTTP externas, y la validación de esquema y el
saneo viven en fases distintas. En el proyecto de referencia hay un solo módulo
puro `validateOutbound(accion)` por el que pasa **todo** lo que sale.

En Perímetro convergen ahí los invariantes 2, 3 y la lista blanca:

- Respuesta al usuario → valida contra el esquema declarado.
- Llamada a proveedor externo → saneo aplicado, destino en lista blanca,
  sensibilidad compatible con el destino.
- Acción sobre el CRM o herramienta → destinatario igual al contacto del caso.
- Escritura hacia la proyección de Firestore → saneada y agregada.

**Un solo módulo, un solo test, un solo sitio donde mirar.** Rechazo →
el caso termina con causa y entrada en el acta.

### 1.4 Memoria con `topicKey` y upsert

El mismo veto repetido veinte veces en una jornada es **una** entrada con
`revisionCount: 20` y `lastSeenAt`, no veinte filas. Con relaciones opcionales
`SUPERSEDES` y `CONFLICTS_WITH` entre entradas.

Es exactamente lo que la fase 9 pide con otras palabras —«agrupa por huella: mil
errores idénticos son un problema con contador, no mil incidentes»— y aquí ya está
implementado. Convención de clave: `familia/descripcion` en kebab-case
(`bloqueo/sin-sustento-cobertura`, `incidente/inyeccion-pdf-corpus`).

**Salvedad:** los incidentes de seguridad de 4C **no se agrupan**. Esa excepción ya
está en el plan y hay que mantenerla.

---

## 2. La disciplina de la sombra — vale más que las cuatro piezas

**Todo vigía nace observando.** Anota `bloquearia: true/false` sin bloquear, corre
dos semanas, se calibra hasta **cero falsos positivos**, y solo entonces pasa a
enforcement.

Perímetro no tiene nada de esto: las fases 4B‑1 y 4C encienden los vigías
bloqueando desde el primer día. Con la respuesta graduada de 4C —observar,
limitar, cuarentena, detener— eso es una receta para poner en cuarentena a un
cliente real la primera semana, que es justo el fallo que la cuarentena existía
para evitar.

Dos reglas que vienen con esto:

> **Prueba de fuego de la sombra.** Si una pieza no puede implementarse sin tocar
> una línea de la lógica de decisión, no se implementa en esa forma.

> **Regresión de sombra.** Tras añadir el harness, las decisiones de un lote
> ejecutado antes y después deben ser **idénticas**. Se verifica con el diff: la
> variable del acta no aparece en ninguna rama condicional del flujo.

### La excepción que hay que entender bien

El harness envuelve todo en `try/catch` degradante — **jamás rompe un caso**; si
falla al anotar, degrada a silencio. Y a la vez existe un barrido que prohíbe
`catch {}` vacíos.

No es contradicción: son **dos capas con reglas opuestas**. La capa de observación
puede tragarse su propio fallo porque su fallo no cambia nada. La capa de decisión
no puede tragarse ninguno. Confundirlas es fácil y caro.

---

## 3. Anti-alucinación — cuatro mecanismos

### 3.1 `null` ≠ `OK` · la ley de fondo

> Un fallo de infraestructura NUNCA se traduce a un veredicto favorable. `null`
> («no sé») y `OK` («revisé y está bien») no son lo mismo. Colapsarlos deja capas
> de seguridad que **parecen activas y nunca se disparan**.

Con dos incidentes medidos detrás: una capa de verificación con **42 de 42 ciclos
marcados «LLM OK» sin que el modelo contestara jamás**, y una herramienta que
reportaba «ejecutado con éxito, 0 filas» cuando no ejecutó nada.

Y el resumen que hay que grabar: **un cero es una respuesta y se cuela; `UNKNOWN`
es una pregunta y se ve.**

**Perímetro ya tiene este bug**, en la maqueta del panel: el vigía de perímetro en
`0 de 0` con punto verde es ausencia de medición renderizada como éxito.

→ Propuesta: **invariante 9**. Ninguna comprobación puede devolver un valor
plausible cuando lo que ocurrió fue que no pudo comprobar. Con su barrido: ni un
`catch` vacío en `src/core/`.

### 3.2 La regla del ticker → la regla del contacto

Es la transferencia más valiosa del proyecto entero.

> El identificador SELECCIONADO manda SIEMPRE. **Nunca** confiar en el que emite el
> modelo. Patrón a vigilar: cualquier `X.id || idActivo` está **al revés** — debe
> ser `idActivo || X.id`. Y si no hay identificador activo, **abortar con aviso**,
> nunca caer a un valor por defecto.

Es exactamente la restricción estructural de 4C‑C —ninguna herramienta acepta el
destinatario desde el texto— pero allí **ya se comieron el bug, ya lo arreglaron y
ya tienen el candado que impide que vuelva**.

Cambia `ticker` por `contactoId` y tienes resueltas la fase 1 (filtro obligatorio
en el repositorio) y la fase 5 (destinatario fijado por el sistema), con la defensa
incluida. La diferencia es la apuesta: allí el modelo cambiaba un símbolo por otro
y compraba el activo equivocado; aquí manda los datos de otro cliente.

Detalle que también se copia: **en los ejemplos del prompt nunca va un
identificador real** — placeholder `<CONTACTO>`, porque el modelo los copia
literalmente.

### 3.3 Datos verificados inyectados, cifras prohibidas

Pre-cargar los datos reales, inyectarlos marcados como `DATOS VERIFICADOS`, y
prohibir explícitamente citar cifras que no estén ahí. El origen: el modelo
inventaba importes que **cambiaban entre corridas**.

Es la cara del prompt de lo que resolvimos con `fragmento_id` en R‑003. Van juntas:
la estructura obliga a citar procedencia, y el prompt le quita las ganas de
inventar. Dos gotchas más del mismo bloque, aplicables tal cual:

- **Inyectar la fecha real.** El modelo cree que el año en curso es ficticio y
  rechaza datos.
- **Temperatura baja** para todo lo que sea veredicto o extracción, por
  consistencia entre corridas.

### 3.4 Validador de narrativa — adoptar el mecanismo, no la pieza

Cruza el texto del modelo contra los números del motor determinista y, si divergen,
**añade una advertencia visible en vez de bloquear**.

Como defensa primaria es el más débil de los cuatro y **no lo copiamos**: nuestra
vía es la estructura con procedencia. Pero el mecanismo resuelve una cosa concreta
que la fase 4 pide y que no teníamos: la **zona intermedia**, donde la respuesta se
envía «con matiz de incertidumbre». Eso es esto, exactamente — y conviene que el
matiz lo componga el código, no el modelo.

---

## 4. Candados que barren el código fuente

Es la versión buena de lo que propuse como «invariantes en CI». Tres patrones.

### 4.1 Honestidad de la documentación

Un test que lee el estado **real desde disco** y barre **todo `docs/`**, poniéndose
rojo si algún documento afirma algo que la máquina no hace. En las dos direcciones:
si mañana se conecta lo que hoy es simulación, exige que el texto deje de decir lo
contrario.

Dos lecciones incorporadas que no se me habrían ocurrido:

- La primera versión vigilaba **tres** archivos y la corrección se había hecho en
  **cuatro**, así que revertir habría dejado la suite verde. Por eso ahora barre el
  **directorio entero**, no una lista.
- *«Si hace falta narrar la historia, se parafrasea: citar la frase vieja
  literalmente vuelve a dejarla escrita en presente, que es justo lo que se está
  prohibiendo.»*

En [[00-CANON]] ya está escrita la regla «si choca con el código, gana el código».
**Esto es el test que la hace cumplir.** Las dos versiones para Perímetro:

- Lee `config/politica.json` y `config/precios.json` y falla si algún documento
  afirma un umbral, un precio o una regla de enrutamiento que no coincide.
- Falla si un documento marca una fase como `CONSTRUIDA` sin que existan las
  pruebas de sus criterios de aceptación.

### 4.2 Candados probados con cebo

Un barrido que se pone rojo si el patrón malo entra en un módulo **nuevo**, con la
regla que lo acompaña:

> Probado con cebos: **un candado que no muerde es peor que no tener candado.**

Cada uno de los checks ⚙️ de [[Propuesta-Desarrollo-Por-Fases]] §5 tiene que
probarse así: meter el import prohibido, ver el rojo, quitarlo. Y dejarlo escrito
en el criterio de aceptación de la fase, no como buena intención.

### 4.3 Auditoría de secretos que no filtra el secreto

Escanea texto **y parches del historial de git**, y el hallazgo **nunca contiene el
valor del secreto**, solo su ruta y su línea. Ese último detalle es literalmente el
criterio de la fase 9: el informe de salud pasa por la misma capa de saneo que las
llamadas externas.

### 4.4 Barridos de comportamiento, no de expresión regular

Del barrido contra el fallo silencioso viene una advertencia que hay que respetar:
cuando el patrón aparece decenas de veces y casi todas están bien, **no se hace un
regex** — se comprueba el comportamiento. *«Un candado que grita siempre se acaba
ignorando.»*

---

## 5. Registro de vigías con autoridad — la fase 4B, terminada

Un registro donde cada vigía declara `id`, `nombre`, **`autoridad`**, `umbral` en
castellano, `porQue` con su incidente de origen, y `fuente` (dónde vive en el
código). Núcleo puro: sin red, sin reloj, sin disco, nunca lanza.

Las tres autoridades coinciden con las que ya pide el plan:

- **DETIENE** — para el turno entero. Nada puede abrirse mientras esté activo.
- **BLOQUEA** — mata este caso. El resto sigue.
- **AVISA** — no impide nada, pero tiene que verse.

El incidente que lo motiva es una lección de producto: una operación no se ejecutó
porque una regla dijo que no, y el aviso que llegó fue `❌ [ERROR] No se pudo
ejecutar...`. *«Gritar avería cuando lo que hubo fue una regla funcionando entrena
a ignorar el canal, y el día que haya una avería de verdad también se ignora.»*
Con la autoridad declarada en el registro, **el mensaje se redacta solo**.

### La regla de la mudez, que Perímetro no tiene

> Un vigía que **nunca** ha actuado es tan sospechoso como uno que actúa siempre.
> Si el veto lleva dos meses mudo, o no ha habido ocasión, o está roto y nadie lo
> sabe.

Por eso cada vigía expone `ultimaVez` y `vecesEsteMes`, y hay una función que los
clasifica. El criterio de la fase 6 pide «umbral, valor actual y última actuación»
— le falta **el juicio sobre la mudez**, que es lo que convierte la lista de vigías
en verde de una declaración en una medición.

---

## 6. Detector de ausencias — la respuesta al `0 de 0`

Caza la avería que no se queja: algo que debería ocurrir deja de ocurrir. Cada día
por separado parece normal; solo se ve contando.

El incidente: una ruta de ejecución llevaba **ocho días muerta sin un solo error**,
y se descubrió porque el usuario pegó unos mensajes, no porque el sistema avisara.

Cuatro estados: `SANO` · `SIN_OPORTUNIDAD` · `SOSPECHOSO` · `CAMINO_MUERTO`.
Y la distinción que lo hace honesto:

> Cero ocurrencias **sin oportunidades** no es una avería. Solo es camino muerto
> cuando hubo ocasiones de sobra y aun así nunca pasó. Sin esa distinción el
> detector cría lobos y se ignora.

**Esto es exactamente el arreglo del `0 de 0` de la maqueta.** El vigía de perímetro
con numerador y denominador en cero no está `SANO` — está `SIN_OPORTUNIDAD`, y debe
verse en blanco con su motivo, nunca en verde. Ver [[CALL_CENTRE_DOCS]] R‑002 y el
criterio del denominador en la fase 4B‑1.

Trae además una salida explícita `noAplica` con motivo declarado, para señales cuyo
cero es lo correcto mientras una condición no se cumpla.

**Sustituye y mejora el vigía de silencio** de la fase 4B‑2: aquel solo detecta
ausencia de telemetría; este detecta ausencia de cualquier ocurrencia esperada, con
su denominador de oportunidades.

Señales que Perímetro debería declarar desde el primer día:

| Señal | Oportunidades | Qué significa su cero |
|---|---|---|
| Casos sensibles retenidos | Casos clasificados como sensibilidad alta | Sin oportunidades: el lote no los cubre |
| Respuestas bloqueadas por sustento | Respuestas generadas | Camino muerto: el verificador no corre |
| Escalados a humano atendidos | Casos en la cola | Camino muerto: la cola no se drena |
| Desvíos local → nube | Fallos o tiempos máximos del local | Sin oportunidades: el local no falló |
| Actuaciones de cada vigía | Casos evaluados | Ver §5, regla de la mudez |

---

## 7. Dos convenciones de base

### 7.1 Núcleo puro con el reloj inyectado

La lógica crítica va separada del I/O en módulos puros: sin red, sin disco, **sin
leer el reloj** — el momento se inyecta. Los tests apuntan al núcleo puro, nunca al
servicio con la nube dentro.

Para Perímetro esto tiene un efecto extra que el proyecto de referencia no
necesita: con el reloj inyectado, **el corredor de la fase 7 es determinista y
reproducible**, que es la condición para que el reporte comparativo signifique
algo. Un lote que da resultados distintos en dos corridas no compara nada.

### 7.2 Las bitácoras se generan desde datos, nunca desde prosa

El parte diario del proyecto de referencia lleva de cabecera:

> Parte determinista generado al cierre del turno. Todas las cifras están medidas
> sobre los registros del día; ninguna está estimada ni redactada por un modelo.

Y el reporte se construye **desde** las entradas estructuradas: el modelo solo
redacta prosa sobre datos ya verificados, **nunca compone el resumen**. Aplica igual
al informe de salud de la fase 9 y al parte diario que ya produce la habilidad
`call_centre_docs`.

---

## 8. Lo que no trae valor, y una excepción

**No aplica:** el gate de confluencia de siete capas (dominio puro de opciones), las
trampas del empaquetado de escritorio, y el problema de las copias divergidas entre
plataformas.

De este último sí se rescata la **lección**: *byte-idéntico ≠ fusible*. Dos módulos
que parecen iguales pueden resolver imports a archivos distintos. Es el mismo
argumento de la interfaz `Canal` contra los dos lienzos duplicados de
[[REFERENCIA-N8N]], y la razón de que la fase 3B exista.

**La excepción que sí aplica y hay que anotar ya:** en Firestore, `limit()` **sin**
`orderBy` devuelve documentos **arbitrarios**, porque los identificadores no son
cronológicos. Perímetro usa Firestore para la proyección del panel. Sin `orderBy`,
«las trazas más recientes» no son las más recientes — y no falla, simplemente
miente.

---

## 9. Qué exige cambiar en la propuesta

Diez ajustes sobre [[Propuesta-Desarrollo-Por-Fases]]. Los cuatro primeros son los
que importan.

1. **Modo sombra obligatorio para todo vigía**, con calibración a cero falsos
   positivos antes de bloquear. Cambia 4B‑1, 4B‑2 y 4C, y añade el criterio de
   regresión de sombra: decisiones idénticas antes y después de instrumentar.
2. **Puerta única de salida en la fase 3**, absorbiendo lista blanca, validación de
   esquema, saneo y destinatario. Hoy están repartidos entre las fases 3, 4 y 5.
3. **Acta de caso y contratos de fase en la fase 0**, junto a la telemetría. Es más
   barato que el evento suelto y es lo que hace posibles las fases 6 y 7.
4. **Invariante 9: `null` ≠ `OK`**, con el barrido de `catch` vacíos en `src/core/`
   y el detector de ausencias como vigía transversal en 4B‑2.
5. **Regla del contacto** escrita como invariante de código en la fase 1, con el
   patrón invertido (`X.id || activo`) como candado de barrido.
6. **Regla de la mudez** en el registro de vigías: `ultimaVez` y `vecesEsteMes`
   expuestos, con su clasificación. Cambia el criterio de la fase 6.
7. **Todos los checks ⚙️ probados con cebo**, como criterio de aceptación explícito
   de la fase que los introduce.
8. **Candado de honestidad documental** en la fase 0: barrido de `docs/` contra
   `config/`, en las dos direcciones.
9. **Núcleos puros con reloj inyectado** como convención de la fase 0, con el
   corredor determinista de la fase 7 como consecuencia declarada.
10. **`orderBy` obligatorio** en toda lectura de la proyección, con su prueba en el
    emulador. Fase 6.

Ninguno añade fases. Los cuatro primeros cambian criterios de aceptación; el resto
son convenciones que se declaran una vez en la fase 0 y se cobran solas después.
