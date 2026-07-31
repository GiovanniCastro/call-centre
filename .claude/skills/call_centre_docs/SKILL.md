---
name: call_centre_docs
description: Mantiene el manual vivo del proyecto Perímetro (call centre). Úsala SIEMPRE que se tome una decisión de diseño, se cierre una fase, se cambie un invariante, se añada o quite una dependencia, o se corrija algo que estaba mal documentado. Registra el cambio en docs/CALL_CENTRE_DOCS.md y en la bitácora del día. También cuando el usuario pida "documenta esto", "actualiza el manual", "qué cambió", "bitácora" o "registro de cambios".
---

# call_centre_docs — el manual vivo de Perímetro

Este proyecto se razona **desde los documentos, no desde el código**. Un documento
desactualizado no es un detalle cosmético: hace decidir sobre una premisa falsa.
Esta habilidad existe para que eso no pase.

## La regla que manda

> **Si un documento choca con el código, gana el código, y el documento se corrige
> el mismo día.**

Nunca al revés. Nunca "ya lo arreglaremos". Si al escribir el registro descubres
que el manual afirma algo que el repositorio contradice, el registro de ese día
incluye la corrección.

## Dónde vive qué

| Archivo | Qué contiene | Cuándo se toca |
|---|---|---|
| `docs/CALL_CENTRE_DOCS.md` | **El manual.** Historial de revisiones + cada cambio con su porqué | En cada cambio de fondo |
| `docs/00-CANON.md` | Verdad única: qué es, invariantes, estado real, glosario | Cuando cambia un invariante o el estado de una fase |
| `docs/INDEX.md` | Puerta del vault de Obsidian | Cuando nace o muere un documento |
| `bitacoras/AAAA/MM/AAAA-MM-DD_cambios.md` | Parte del día, uno por jornada de trabajo | Al cerrar la sesión de trabajo |

## Cuándo escribir

Escribe una entrada si ocurrió **cualquiera** de estas:

- Se cerró una fase o se movió su estado (PROPUESTO → EN CURSO → CONSTRUIDO).
- Se tomó una decisión de diseño con alternativas descartadas.
- Cambió un invariante, un umbral, o la política de enrutamiento.
- Se añadió, quitó o rechazó una dependencia.
- Se descubrió que un documento decía algo falso.
- Se relajó un criterio de aceptación (esto **siempre** se registra; un criterio
  relajado en silencio es deuda invisible).

**No** escribas entrada por: refactores sin cambio de comportamiento, correcciones
de tipografía, o exploración que no concluyó en nada.

## Formato de entrada en el manual

Cada entrada del manual va en `docs/CALL_CENTRE_DOCS.md`, bajo la revisión del
día, con esta estructura de cuatro campos. No inventes campos ni los omitas.

```markdown
### R-014 · Desdoblado el campo `resultado` de telemetría

**Contexto.** El esquema de la fase 0 tenía un único enum `resultado` que mezclaba
el desvío de local a nube con el escalado a un humano.

**Qué cambió.** `resultado ∈ {resuelto, escalado_humano, descartado, bloqueado}` y
un campo nuevo `desvio_ejecucion ∈ {ninguno, local_a_nube, nube_a_local}`.

**Por qué.** Contar sobre el enum anterior producía dos cifras distintas para lo
mismo. Es el defecto que apareció en la maqueta del panel: 41 escalados en el KPI
y 17 en el reparto del enrutador, sobre los mismos 190 casos.

**Impacto.** Toca [[Propuesta-Desarrollo-Por-Fases]] §Fase 0 y el criterio de
aceptación de reconciliación de la fase 6. Sin efecto en código: no hay eventos
escritos todavía.
```

Numeración correlativa `R-001`, `R-002`… nunca se reutiliza un número, ni siquiera
si la entrada se revierte. Una reversión es una entrada nueva que enlaza a la
anterior.

## Formato de la bitácora del día

`bitacoras/AAAA/MM/AAAA-MM-DD_cambios.md`. Es el parte, no el manual: qué se hizo,
qué se midió, qué quedó abierto. Encabezado obligatorio:

```markdown
# Perímetro · <día> de <mes> de <año>

> Parte de la jornada. Toda cifra está medida contra el repositorio o contra una
> ejecución registrada; ninguna está estimada.

## Qué se hizo
## Qué quedó abierto
## Entradas de manual generadas
```

Si la jornada no produjo ninguna medición, dilo explícitamente en vez de rellenar.

## Prohibido en estos documentos

- **Cifras sin ejecución detrás.** Si un número no sale de una corrida registrada
  o de un `SELECT` sobre la base, no entra. Si hace falta un ejemplo, se marca
  como ejemplo en la misma línea.
- **Estado optimista.** Una fase está CONSTRUIDA cuando sus criterios de
  aceptación tienen prueba automatizada que pasa. Antes de eso está EN CURSO,
  aunque el código exista.
- **Duplicar la verdad.** Si algo ya está en `00-CANON.md`, el manual lo enlaza,
  no lo repite. Cuatro documentos afirmando lo mismo terminan contradiciéndose,
  y el proyecto de referencia perdió veintitrés días exactamente así.
- **Registrar sin porqué.** Un cambio sin su motivo es un cambio que alguien va a
  deshacer dentro de tres meses.

## Estados que se usan

`PROPUESTO` · `EN CURSO` · `CONSTRUIDO` · `EN VIGOR` · `DESCARTADO` · `BLOQUEADO`

`CONSTRUIDO` y `EN VIGOR` no son lo mismo: lo primero es que existe y pasa
pruebas; lo segundo es que está desplegado y actuando en producción.

## Enlaces

El vault es Obsidian. Enlaza con `[[nombre-del-archivo-sin-extension]]`. Enlaza
generosamente: un enlace a una nota que aún no existe no es un error, es una nota
pendiente de escribir.

## Procedimiento

1. Lee `docs/CALL_CENTRE_DOCS.md` para saber cuál es el último número `R-NNN`.
2. Añade la revisión del día si no existe (encabezado `## Revisión AAAA-MM-DD`).
3. Escribe la entrada con los cuatro campos.
4. Actualiza la tabla de historial de revisiones al principio del manual.
5. Si cambió el estado de una fase o un invariante, actualiza también
   `docs/00-CANON.md` — es la fuente única.
6. Si nació o murió un documento, actualiza `docs/INDEX.md`.
7. Al cerrar la jornada, escribe o completa la bitácora del día.
