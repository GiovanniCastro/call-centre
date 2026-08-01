# 🗺️ Perímetro — Índice del vault

> Puerta de entrada al conocimiento del proyecto.
> **Para la IA:** al empezar una sesión, lee esta nota y [[00-CANON]] antes de
> tocar nada. **Para Giovanni:** abre `docs/` como vault en Obsidian.

**Qué es Perímetro.** Agente de atención al cliente con enrutamiento híbrido entre
modelo local y modelo en la nube, instrumentado para auditar costo y salida de
datos. El valor no está en que responda; está en que cada respuesta sea rastreable,
costeable y auditable.

---

## Núcleo — léelo primero

- [[00-CANON]] — 🎯 **documento único**: qué es, los ocho invariantes, arquitectura
  en dos planos, stack fijado y lo que queda fuera, **estado real medido contra el
  disco**, glosario y decisiones tomadas. Si algo choca con el código, gana el
  código.
- [[CALL_CENTRE_DOCS]] — 📘 **el manual**: cada cambio de fondo con su contexto,
  qué cambió, por qué y a qué afecta. Veintiuna entradas en dos revisiones, a
  31‑jul‑2026. Lo mantiene la habilidad `call_centre_docs`.
- [[Propuesta-Desarrollo-Por-Fases]] — 🧭 **el cómo y el cuándo**: dieciséis fases
  con criterios de aceptación, los invariantes convertidos en checks de CI que
  bloquean el merge, protocolo de git y GitHub, y el reparto de Firebase. Sustituye
  al orden del plan original.
- [[Perimetro-Manual-Claude-Code]] — 🛠️ protocolo de sesión con el agente: plan
  antes que código, pruebas primero, implementación acotada, puerta de
  verificación. Y qué vigilar del propio agente.

## Referencia

- [[TRASPLANTE]] — 🧬 lo que traemos del proyecto de referencia: harness con acta
  de caso y contratos de fase, puerta única de salida, modo sombra antes de
  bloquear, `null` ≠ `OK`, detector de ausencias, registro de vigías con autoridad
  y regla de la mudez, y los candados que barren el código. **PROPUESTO** — §9
  lista los diez cambios que exige.
- [[REFERENCIA-N8N]] — 🔁 el flujo de n8n del que venimos, **que no entra en el
  stack**. Qué confirma del plan, qué hace de otra forma —su verificador es un
  modelo arreglando a otro modelo— y qué se rescata tal cual.

## Bitácoras

Partes de jornada en `bitacoras/AAAA/MM/`. Uno por día de trabajo, con lo que se
hizo, lo que quedó abierto y las entradas de manual que salieron.

- `bitacoras/2026/07/2026-07-30_cambios.md` — revisión del plan y del panel,
  propuesta de desarrollo, montaje del vault
- `bitacoras/2026/07/2026-07-31_cambios.md` — fase 0 construida: telemetría,
  costeo, migraciones y CI; los checks demostrados fallando; dos defectos
  encontrados y corregidos (una regla que acusaba mal, una prueba que no probaba)
- `bitacoras/2026/07/2026-07-31_fase-1.md` — fase 1 construida: canal Telegram,
  borde endurecido, alcance de contacto en tres capas; 99 pruebas en el CI contra
  Redis y PostgreSQL reales; ocho pruebas que fallaron y por qué eran mías

---

## Cómo se trabaja aquí

**Una sesión por fase.** Plan antes que código, pruebas de los criterios de
aceptación primero, implementación acotada a la fase, y puerta de verificación
antes del commit. Al cerrar la fase se cierra la sesión: arrastrar el contexto de
tres fases degrada las decisiones.

**Una rama y un PR por fase.** `fase/N-nombre`, squash merge, etiqueta `v0.N`.
`main` protegida, merge bloqueado si el CI no pasa. La rama es la unidad de
retroceso: si una fase no pasa sus criterios al tercer intento, se descarta la rama,
no se parchea `main`.

**Nada se documenta a futuro.** Una fase está CONSTRUIDA cuando sus criterios
tienen prueba automatizada que pasa. Antes de eso está EN CURSO, aunque el código
exista.

**Ninguna cifra sin ejecución detrás.** Si un número no sale de una corrida
registrada o de una consulta a la base, no entra en ningún documento ni en el
panel.

---

## Estado en una línea

**Fases 0 y 1 construidas.** Entra un mensaje por Telegram, se verifica, se agrupa
y se guarda. Nadie responde todavía: no hay recuperación ni enrutador. 99 pruebas
en el CI, contra Redis y PostgreSQL reales. Bloqueantes conocidos: el corpus de la
empresa ficticia, la máquina de referencia para Ollama y el proveedor de nube — el
trámite de WhatsApp dejó de bloquear con R‑020. Ver [[00-CANON]] §Parte 4.
