# Perímetro · 4 de agosto de 2026 — panel y lazo del canal

> Parte de la jornada. Toda cifra está medida contra el repositorio o contra una
> ejecución registrada; ninguna está estimada.

Tercera sesión del día, después de [[2026-08-04_fase-8a]] y [[2026-08-04_fase-9]].
Empezó como trabajo de pantalla y terminó encontrando una costura que ninguna fase
reclama como suya.

---

## Qué se hizo

### El panel arrancaba en el sitio equivocado

`npm run panel` levantaba Vite y `/` devolvía **404**. `root: '.'` en
`panel/vite.config.ts` se resuelve contra el directorio de trabajo, y las órdenes
se lanzan desde la raíz del repositorio: Vite estaba sirviendo el perímetro entero.
El panel solo aparecía bajo `/panel/`, y `panel/public/` no se servía, con lo que
la reproducción no cargaba sus datos.

Corregido para que `root` se resuelva desde el propio archivo de configuración, que
es lo que su comentario de cabecera ya decía que hacía. Medido antes y después:

| Ruta | Antes | Después |
|---|---|---|
| `/` | 404 | 200 |
| `/src/main.tsx` | 404 | 200 |
| `/demo/lote.json` | 404 | 200 · 2 171 B |
| `/demo/casos.json` | 404 | 200 · 41 971 B |

**`panel/dist` quedó obsoleto**: es de antes del arreglo y es lo que `firebase.json`
publica en Hosting. Hay que reconstruirlo antes de desplegar.

### La maqueta entra en el panel

Portado el sistema de diseño de la maqueta de Operación a `panel/src/estilo.css`,
tokenizado, y reescritas las dos pantallas sobre él. Archivos nuevos: `ui.tsx` con
las piezas —barra lateral, cabecera, tarjeta, KPI, barras apiladas, barras de
reparto, lista de estado, etiquetas, pie— y `formato.ts`, que centraliza cómo se
escribe una cifra y cómo se escribe su ausencia.

Tres piezas de la maqueta **no se portaron** porque no tienen fuente de datos: las
barras por día con su chispa de tendencia, el selector de periodo y la lista de
vigías con umbral y autoridad. Qué las sustituye y por qué está en R‑051.

Iconos SVG en línea, ninguno emoji. El de economía venía de la maqueta con los
arcos invertidos —una «S» espejada— y se rehízo con dos semicírculos exactos.
Añadido un interruptor de claro/oscuro que solo pone `data-tema` en la raíz.

Verificado: `check:panel`, `eslint panel` y las pruebas que atan la banda de
demostración al discriminante y la exención de la calculadora, **23 pruebas, 23
pasan**, sin tocar ninguna.

### El estado real del sistema, comprobado

`npm run verificar` **pasa entero**: tipos, lint, arquitectura, **473 pruebas** más
**6 de reglas** contra el emulador de Firestore. Salida 0.

Servicios en pie: `postgres`, `redis` y `qdrant` sanos desde hace 20 horas; Ollama
respondiendo con `gemma4:latest`, `qwen3.6:latest` y `bge-m3:latest`.

El perímetro arranca y escucha en `:8787`. `GET /salud` → 200. `GET /canales` → 200
con Telegram y `lote` configurados y WhatsApp declarado con sus cuatro requisitos.
**`POST /webhook/telegram` sin el secreto → 401.**

La base de conocimiento responde: la consulta «¿Cuánto cuesta el seguro de
inquilino?» devolvió dos fragmentos con puntuación **0.775** y **0.612** sobre un
umbral de 0.55, cada uno con su identificador.

Y tres casos reales pasados por el ciclo completo con gemma4, lote
`comprobacion-en-vivo`: **1 acierto de 3**, 2 resueltos, 1 escalado, **20 256 ms**
de media, costo PROVISIONAL, 1 de 1 de sensibilidad alta retenido, ningún vigía
disparado. El caso de sensibilidad alta escaló con sustento 0 % por debajo del
umbral de matiz del 70 %.

### El hallazgo

Cuatro comprobaciones, y la conclusión:

| Qué | Resultado |
|---|---|
| Quién importa `src/core/caso` | **un solo archivo**: `src/lote/corredor.ts` |
| La interfaz `Cola` | declara `encolar` y `pendientes`; **no declara desencolar** |
| Quién instancia `EmisorPostgres` | **nadie** fuera de las pruebas |
| `select count(*) from eventos` | **0 filas** |

El ciclo de caso funciona y solo lo invoca el corredor del lote. `main.ts` monta el
registro de canales, el almacén, la cola, el despachador y el servidor; no monta el
agente. Un mensaje de Telegram se verifica, se agrupa, se persiste y se encola —y
ahí termina.

Escrito [[Plan-Lazo-Del-Canal]]: fase 11 con cuatro subfases, numerada la última y
ordenada la primera. **PROPUESTO, nada construido.**

### Adaptar el sistema a otro negocio

La sesión siguió con la pregunta de cómo servir a un dentista o a una cristalería
sin reescribir nada. Comprobado el acoplamiento real al ramo asegurador, fuera del
corpus:

| Dónde | Qué | Veredicto |
|---|---|---|
| `clasificar.ts` | `'mi póliza'`, `'presentar un siniestro'`, `'abrir un siniestro'` | **Incumple una regla ya escrita**: la política de enrutamiento va en `config/` |
| `detectores.ts` | `póliza` en el regex de «pide datos de otro» | Menor, mismo arreglo |
| `esquemas.ts` | **Nada** — `datos` es `array<{valor, fragmento_id}>` | Ya es agnóstico |
| `panel/src/` | **Ni una palabra de seguros** | Ya se adapta |
| Clases de tarea | Las seis sirven a los tres sectores | Nada que hacer |

Dos hallazgos con consecuencia. El primero: **los productos de un negocio son su
corpus** — un editor de catálogo produciría datos que el verificador de procedencia
rechazaría, porque no habría `fragmento_id` que citar. El segundo, una corrección a
una propuesta hecha en esta misma sesión: iba a incluir «esquemas de salida por
sector» y el código dice que los esquemas **ya no tienen campos de dominio**. La
fila sobraba y se retiró.

Escrito [[Plan-Perfil-De-Negocio]], fase 12, tres subfases.

### La decisión sobre el soporte

Medido: la tabla `escalados` se escribe desde la fase 4 con motivo, transcripción y
contexto, y **ninguna pantalla la lee**. Son **41 casos de 65** en la corrida
vigente.

Decidido hacer las dos superficies y en este orden: primero la bandeja del operador
—sobre un canal humano que ya existe, no una consola nueva—, después el plano de
control multi‑cliente, que vivirá en otro repositorio y **solo leerá proyecciones**.

Y de paso salió la regla que ordenaba tres decisiones a la vez —credenciales,
perfil y escalados—: **el panel lee, el perímetro escribe**. Escrito
[[Plan-Soporte]].

---

## Qué quedó abierto

- **La fase 11 entera.** Ninguna línea de código escrita. Seis o siete sesiones
  estimadas en el plan; la estimación es lo único de ese documento que no está
  medido, y se dice.
- **`panel/dist` sin reconstruir.** Es lo que despliega Hosting.
- **Un identificador duplicado en el lote de la fase 7.** `lote/casos.json` tiene
  65 casos y **64 identificadores únicos**: `lote:v1:001` aparece dos veces, así
  que la reproducción enseña la pregunta del primero en las dos filas. El arreglo
  va en el lote, no en el panel; en la tabla se dejó la posición en la clave para
  no esconderlo. Material de issue con etiqueta de fase 7.
- **`lote/resultados/comprobacion-en-vivo.json`** quedó en disco. Es una corrida
  real de tres casos, no del lote de la fase 7; borrable sin perder nada.
- Lo de siempre, sin cambios: la máquina de referencia sin caracterizar mantiene
  todo costo en PROVISIONAL, y sin `ANTHROPIC_API_KEY` los modos nube e híbrido
  siguen sin correrse.

---

## Entradas de manual generadas

Revisión 9 de [[CALL_CENTRE_DOCS]]:

- **R‑051** — La maqueta de operación entra en el panel, y lo que no tiene fuente
  no se dibuja.
- **R‑052** — Corrección: el ciclo de caso funciona y solo lo invoca el corredor
  del lote.
- **R‑053** — El montaje del ciclo se comparte con el corredor, no se duplica.
- **R‑054** — La cola no tiene lado de consumo, y por eso el consumidor no falta:
  no se puede escribir.
- **R‑055** — La fase 11 se numera la última y se ordena la primera.

Revisión 10:

- **R‑056** — Los productos de un negocio son su corpus, no una tabla.
- **R‑057** — Corrección: los esquemas de salida ya son agnósticos, y el perfil no
  los declara.
- **R‑058** — Plantillas por herencia, y cuatro en vez de ocho.
- **R‑059** — Un perfil declara capacidades y palabras, nunca garantías.
- **R‑060** — El panel lee, el perímetro escribe.
- **R‑061** — La bandeja del operador va primero; el plano de control es otro
  producto.
- **R‑062** — Un identificador duplicado en el lote de la fase 7.
- **R‑063** — El orden de trabajo: la clave de nube antes que cualquier fase.

Actualizados [[00-CANON]] —tabla de fases con 11A‑D, 12A‑C y 13A‑B, estado real y
decisiones— e [[INDEX]], cuyo «estado en una línea» seguía en las fases 0 y 1.

**Nada de las fases 11, 12 y 13 está construido.** Tres planes escritos en un día
son tres planes, no tres fases; el criterio de este proyecto es que una fase está
CONSTRUIDA cuando sus criterios tienen prueba que pasa.
