# Perímetro — Plan del perfil de negocio · fase 12

> **Estado: PROPUESTO.** Nada construido. Va **después** de [[Plan-Lazo-Del-Canal]]:
> configurar un negocio cuyo agente todavía no contesta es decorar.
>
> Complementa a [[Propuesta-Desarrollo-Por-Fases]]. La verdad única sigue siendo
> [[00-CANON]]. Decisiones en [[CALL_CENTRE_DOCS]] R‑056 a R‑059.

---

## 1. La pregunta, y la respuesta corta

«Que el dueño pueda poner sus productos y adaptar el panel a su negocio — una
aseguradora, un dentista, una cristalería.»

Tres respuestas, en orden de importancia:

**Los productos ya son el corpus.** El invariante 1 dice que sin fuente no hay
respuesta: el agente solo puede hablar de lo documentado. Un editor de productos
que escribiera a una tabla que el agente no puede citar sería inútil —la
ignoraría— o una violación, si le dejáramos responder desde ahí. Configurar los
productos de un negocio **es subir sus documentos**, y esa superficie ya está
especificada en la fase 2: «ingestión desde carpeta vigilada y desde Cloud
Storage, registrando quién subió cada documento y cuándo».

**El panel ya se adapta.** Medido el 4‑ago‑2026: **no hay una sola palabra de
seguros en `panel/src/`**. Las columnas del gráfico de categorías salen de los
datos. Cambia el corpus y cambia el gráfico. Lo que falta no es flexibilidad: es
el nombre del negocio, que hoy no existe en ninguna parte.

**Y lo que varía de verdad cabe en un archivo.** Este plan lo declara, lo saca del
código donde hoy está mal puesto, y lo envía con plantillas para los sectores que
más lo van a usar.

---

## 2. Qué está acoplado hoy al negocio, medido

| Dónde | Qué | Veredicto |
|---|---|---|
| `corpus/` | 17 documentos de Nimbo Seguros | Por diseño. Es el punto |
| [clasificar.ts:115](../src/core/enrutador/clasificar.ts#L115) | `'mi póliza'`, `'presentar un siniestro'`, `'abrir un siniestro'` entre los marcadores | **Incumple una regla ya escrita** |
| [detectores.ts:69](../src/core/seguridad/detectores.ts#L69) | `póliza` dentro del regex de «pide datos de otro» | Menor, mismo arreglo |
| El nombre del negocio | No existe | Falta |
| Esquemas de salida | **Ya son agnósticos** | Nada que hacer — ver §3 |
| Clases de tarea | saludo, catálogo, extracción, agendamiento, queja, ambiguo | **No cambian entre sectores** |
| Patrones de saneo | «seguro social» es PII de EE. UU., no del ramo | No está acoplado |

Lo del clasificador no es alcance nuevo. `CLAUDE.md` dice: «Precios, umbrales y
**política de enrutamiento** en `config/`, jamás en código». Los marcadores que
deciden si un mensaje es extracción o catálogo son política de enrutamiento y
están en un `.ts`. Sacarlos es **cumplir una regla**, y da la casualidad de que es
justo la pieza que hay que tocar para servir a un dentista.

---

## 3. Corrección: el perfil no declara esquemas de salida

Una versión anterior de esta propuesta incluía un campo `esquemas` donde cada
sector declararía sus campos factuales —«tratamiento, precio, duración» para el
dentista—. **Contra el código, esa fila sobra.**

[esquemas.ts](../src/core/respuesta/esquemas.ts) define la salida de todas las
clases sobre una forma común: `datos` es un `array<{valor, fragmento_id}>`, una
lista de afirmaciones que cargan su procedencia, **sin un solo campo de dominio**.
No hay «póliza» ni «cobertura» en ningún esquema.

Que sea así no es una carencia: es lo que permite que un único verificador de
procedencia —existe el fragmento, se recuperó en esta ejecución, el valor aparece
literalmente— sirva igual a los tres sectores. Meter campos por sector daría un
verificador por sector, y la garantía dejaría de ser una y pasaría a ser tres que
hay que mantener iguales.

**El perfil no toca los esquemas.** Como mucho aporta, más adelante, una lista de
campos *esperados* que ayude a redactar la petición al modelo — y eso es
orientación para el prompt, no contrato de validación.

---

## 4. Las cuatro decisiones de este plan

**Una. Plantillas por herencia, no por copia.** Se envía una plantilla `base` con
todo lo genérico —las seis clases de tarea, el léxico común, el vocabulario por
omisión— y cada sector **declara solo lo que difiere**. Copiar el archivo entero
por sector daría cuatro ficheros que divergen: el día que se corrija un marcador
mal puesto, se corrige en uno y sigue mal en tres. Es el mismo razonamiento de
R‑034 y R‑053 aplicado a la configuración.

**Dos. El léxico es aditivo.** Un perfil **añade** marcadores; no quita los del
`base`. Si un sector necesita que un marcador común no se aplique, eso es un
defecto del `base` y se arregla ahí, a la vista de todos.

**Tres. Un perfil no puede debilitar una garantía.** Esta es la regla dura de la
fase y va en §6. Un perfil declara **capacidades y palabras**; nunca umbrales con
autoridad, vigías, patrones de saneo a retirar ni la exigencia de procedencia.

**Cuatro. Un perfil inválido no arranca.** Distinto de un secreto que falta, que
sí arranca y avisa. La diferencia: sin una credencial se pierde una capacidad
declarada; con un perfil malformado el sistema no sabe de qué negocio es, y **toda
respuesta sería de otro**. Lo primero se degrada; lo segundo no.

---

## 5. Qué declara un perfil

`config/negocio.json`, versionado, con diff, autor y fecha — la misma
auditabilidad que el canon exige de los umbrales cuando descartó Remote Config.

| Campo | Qué es | Ejemplo dental |
|---|---|---|
| `extiende` | Qué plantilla hereda | `"base"` |
| `nombre`, `sector` | Marca del panel y agrupación | «Clínica Vega», `dental` |
| `vocabulario` | Cómo se llaman las cosas en pantalla | caso → «consulta», cliente → «paciente» |
| `lexico` | Marcadores por clase de tarea, **aditivos** | `agendamiento`: «cita para limpieza», «me duele» |
| `clases_tarea` | Cuáles se activan, subconjunto de las seis | las seis |
| `modulos` | Qué herramientas de la fase 5 se ofrecen | prospecto, disponibilidad, cita, confirmación |
| `sensibilidad` | Clases y patrones **añadidos** | datos de salud |

Y la carpeta del corpus. Eso es la configuración entera de un negocio: **un archivo
y una carpeta**.

---

## 6. Lo que un perfil NO puede declarar

La regla dura, y la prueba que la sostiene.

| No puede | Dónde sigue viviendo | Por qué |
|---|---|---|
| Vigías, sus umbrales o su autoridad | `config/vigias.json` | Un perfil que apaga el vigía de perímetro apaga el producto |
| Umbrales de sustento y de matiz | `config/respuesta.json` | Aflojarlos es aflojar el invariante 1 |
| La regla dura de enrutamiento | `config/politica.json` | «Sensibilidad alta nunca sale del perímetro» no es opinable |
| Retirar patrones de saneo | `config/` + código | Solo se pueden **añadir**. Quitar es abrir un agujero |
| Eximir un campo de procedencia | `esquemas.ts` | Ver §3 |
| Destinos de salida | `config/destinos.json` | La lista blanca es lista blanca |

**Criterio que lo hace cierto:** una prueba carga un perfil hostil —que intenta
poner el vigía de perímetro en `avisar`, bajar el umbral de sustento a cero y
retirar un patrón de saneo— y **falla si alguna de las tres cosas surte efecto**.
Es el mismo método con el que se comprobaron los checks de la fase 0: añadir la
violación y verla rebotar.

---

## 7. Las plantillas que se envían, y por qué solo cuatro

| Plantilla | Para quién | Qué la distingue |
|---|---|---|
| `base` | Nadie la usa sola | Las seis clases, el léxico común, el vocabulario por omisión |
| `seguros` | Aseguradora | Ya existe como corpus: Nimbo Seguros, 17 documentos |
| `dental` | Clínica dental | Agendamiento como clase dominante; datos de salud como sensibilidad añadida |
| `instalacion` | Cristalería, reformas, taller | El presupuesto con visita previa: extracción de medidas antes de poder citar precio |

**Cuatro y no ocho.** Cada plantilla necesita su léxico, su vocabulario, un
esqueleto de corpus y una prueba de que arranca. Ocho plantillas a medias son peor
que tres de verdad: quien coge la suya y no funciona no vuelve. Cuando haya un
quinto sector con un cliente real detrás, se añade con su corpus y su prueba.

El criterio para que un sector merezca plantilla es el mismo que hace que este
producto sirva: **catálogo documentable, algo que agendar o presupuestar, y datos
del cliente que convenga no sacar del perímetro.** Un restaurante no lo cumple —no
hay catálogo que citar más allá de la carta— y por eso no está.

---

## 8. Secuencia

| Fase | Nombre | Sesiones | Depende de |
|---|---|---|---|
| **12A** | El perfil, y el léxico fuera del código | 2 | 11A |
| **12B** | Las plantillas por herencia y el arranque de un negocio nuevo | 2 | 12A |
| **12C** | Marca y vocabulario en el panel | 1 | 12B, 6 |

---

## 9. Las fases

### Fase 12A — El perfil, y el léxico fuera del código

**Construir.**

- `config/negocio.json` con el esquema de §5, validado con `zod` al arrancar. Un
  perfil inválido **detiene el arranque** y dice qué campo falla.
- Los marcadores de `clasificar.ts` pasan al perfil. El clasificador los recibe;
  no los conoce.
- Igual con el `póliza` del detector de «datos de otro»: el patrón se compone del
  léxico, no se escribe.
- El perfil viaja por el mismo puerto que el resto de la configuración. Ninguna
  clase del dominio lee `config/` directamente — eso ya es así hoy.

**Criterios de aceptación.**

- **Un perfil hostil no debilita nada.** La prueba de §6, con las tres tentativas.
- Cambiar un marcador en el perfil cambia la clasificación **sin tocar código**.
  Prueba explícita con un caso que pasa de `ambiguo` a `agendamiento`.
- Un perfil malformado no arranca, y dice qué campo.
- El lote de la fase 7 sigue dando **las mismas cifras** con el perfil `seguros`.
  Si cambian, el léxico extraído no es el que había — y eso es un defecto, no una
  mejora.

**Qué no se hace aquí.** Ni plantillas, ni panel. Solo mover a datos lo que hoy es
código, sin cambiar comportamiento.

---

### Fase 12B — Plantillas por herencia y arranque de un negocio nuevo

**Construir.**

- Resolución de `extiende`: `base` más las tres sectoriales, con mezcla aditiva
  para el léxico y la sensibilidad, y sustitución para vocabulario y módulos.
- **Esqueleto de corpus por plantilla**: qué documentos necesita el sector para que
  el agente pueda responder, en forma de lista de huecos que la ingestión declara
  vacíos. Es lo contrario de rellenar: dice qué falta.
- Orden `npm run negocio:nuevo <plantilla>` que deja el perfil y la carpeta de
  corpus listos para llenar.

**Criterios de aceptación.**

- **Una clínica dental arranca cambiando `config/negocio.json` y la carpeta del
  corpus, sin tocar una línea de `src/core/`.** Verificable con el diff del PR y
  con el check de arquitectura — el mismo método con el que la fase 3B probó la
  abstracción `Canal`, y por la misma razón: un criterio que se verifica leyendo
  código no se verifica.
- Un perfil que hereda y no declara nada se comporta como su plantilla. Prueba de
  igualdad.
- Corregir un marcador en `base` corrige los tres sectores. Prueba explícita: es
  la razón de ser de la herencia.
- Arrancar con corpus vacío **no inventa**: el agente escala todo y lo dice.

---

### Fase 12C — Marca y vocabulario en el panel

**Construir.**

- El perfil viaja en la proyección como un documento más. El panel no habla con el
  perímetro y no puede: lee lo publicado. Un solo sentido, invariante 8 intacto.
- Nombre del negocio en la cabecera, y el vocabulario aplicado a las etiquetas.
- **Ninguna cifra cambia de definición al cambiar de palabra.** «Consulta» y
  «caso» son la misma variable con dos nombres; el reparto y el KPI siguen leyendo
  de donde leen.

**Criterios de aceptación.**

- Cambiar `vocabulario` cambia las etiquetas y **no** las cifras. Prueba de
  reconciliación con dos perfiles distintos sobre los mismos datos.
- El perfil publicado **no contiene** ninguna ruta de archivo ni credencial. Pasa
  por la misma capa de saneo que el resto de la proyección.
- La demo pública sigue sin exponer el perfil de un cliente real.

---

## 10. Lo que este plan no hace

**Un dashboard configurable** —elegir métricas, mover tarjetas—. Tres razones.

Las cifras que importan son idénticas en los tres sectores: costo por caso
resuelto, resueltos sin intervención, primera respuesta, escalados, egreso por
sensibilidad. Un dentista quiere exactamente esas.

Rompería lo que hace creíble al panel. La fase 6 decidió que dos métricas que
cuentan lo mismo **no puedan divergir**, porque leen la misma variable (R‑034). En
cuanto alguien compone su propia métrica, esa garantía desaparece.

Y `CLAUDE.md` lo prohíbe por dos lados: «Construir un CRM» está en la lista, y un
editor de catálogo más un constructor de pantallas son un CRM y una herramienta de
BI — dos productos más grandes que este.

**Multi‑tenant.** Un perímetro por cliente, no `negocio_id` en cada consulta. Meter
los pacientes de un dentista y los asegurados de una compañía en la misma base
contradice lo que el producto vende, y obligaría a hilar un segundo filtro tan
crítico como `AlcanceContacto` por toda la capa que la fase 1 tardó tres sesiones
en endurecer. El perfil es lo que hace barata la multi‑instancia: un archivo y una
carpeta por cliente.

---

## 11. Riesgos

- **Que el léxico extraído no sea el que había.** Si el lote cambia sus cifras tras
  12A, la extracción se comió un marcador. Por eso el criterio es igualdad exacta y
  no «resultados parecidos».
- **Que el perfil crezca hasta ser un lenguaje.** Cada campo nuevo es una decisión
  que sale del control de versiones y entra en un archivo que alguien edita a
  mano. La lista de §5 es cerrada; ampliarla es una decisión con entrada en el
  manual.
- **Que las plantillas envejezcan.** Tres corpus de ejemplo que nadie vuelve a
  mirar acaban contradiciendo al código. Cada plantilla lleva su prueba de
  arranque; sin ella, no se envía.
