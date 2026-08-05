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
  qué cambió, por qué y a qué afecta. Sesenta y una entradas en diez revisiones, a
  4‑ago‑2026. Lo mantiene la habilidad `call_centre_docs`.
- [[Propuesta-Desarrollo-Por-Fases]] — 🧭 **el cómo y el cuándo**: dieciséis fases
  con criterios de aceptación, los invariantes convertidos en checks de CI que
  bloquean el merge, protocolo de git y GitHub, y el reparto de Firebase. Sustituye
  al orden del plan original.
- [[Plan-Lazo-Del-Canal]] — 🔌 **fase 11, camino crítico**: el ciclo de caso
  funciona y solo lo invoca el corredor del lote; la interfaz de la cola no declara
  desencolar. Cuatro subfases para que un mensaje que entra por un canal salga
  contestado y deje su evento. Numerada la última, ordenada la primera.
  **PROPUESTO** — nada construido.
- [[Plan-Perfil-De-Negocio]] — 🏷️ **fase 12**: adaptar el sistema a otro sector.
  Los productos de un negocio **son su corpus**; el léxico del clasificador sale
  del código a `config/negocio.json`; cuatro plantillas por herencia —base,
  seguros, dental, instalación—. Y la regla dura: un perfil declara palabras y
  capacidades, nunca vigías ni umbrales. **PROPUESTO**.
- [[Plan-Soporte]] — 🎧 **fase 13 y el plano de control**: 41 de 65 casos escalan a
  una tabla que ninguna pantalla lee. Primero el escalado a un canal humano que ya
  existe, después la bandeja propia. El plano de control multi‑cliente es otro
  repositorio y solo lee proyecciones. **PROPUESTO**.
- [[Perimetro-Manual-Claude-Code]] — 🛠️ protocolo de sesión con el agente: plan
  antes que código, pruebas primero, implementación acotada, puerta de
  verificación. Y qué vigilar del propio agente.

## Referencia

- [[TRASPLANTE]] — 🧬 lo que traemos del proyecto de referencia: harness con acta
  de caso y contratos de fase, puerta única de salida, modo sombra antes de
  bloquear, `null` ≠ `OK`, detector de ausencias, registro de vigías con autoridad
  y regla de la mudez, y los candados que barren el código. **PROPUESTO** — §9
  lista los diez cambios que exige.
- [[DESPLIEGUE]] — 🚀 **runbook de cero a demo pública**: la máquina del
  perímetro, los secretos en producción, los respaldos con su restauración
  verificada, la proyección y lo que falta para la nube. Cada sección dice si está
  ejecutada o no; la lista de verificación del final tiene cuatro casillas sin
  marcar, y son las de la fase 8B.
- [[ENTORNO-LOCAL]] — 🧰 cómo ejecutar el perímetro en tu máquina: qué funciona
  solo con Node, qué exige Docker, y los dos comandos elevados que hacen falta en
  Windows. Una prueba omitida no es una prueba aprobada.
- [[REFERENCIA-N8N]] — 🔁 el flujo de n8n del que venimos, **que no entra en el
  stack**. Qué confirma del plan, qué hace de otra forma —su verificador es un
  modelo arreglando a otro modelo— y qué se rescata tal cual.

## Bitácoras

Partes de jornada en `bitacoras/AAAA/MM/`. Uno por día de trabajo, con lo que se
hizo, lo que quedó abierto y las entradas de manual que salieron.

- `bitacoras/2026/08/2026-08-04_lazo-del-canal.md` — la maqueta entra en el panel,
  con las tres piezas que no tienen fuente declaradas en vez de rellenadas; y el
  hallazgo del día: el ciclo de caso funciona y solo lo invoca el corredor del
  lote. Nace la fase 11
- `bitacoras/2026/08/2026-08-04_fase-9.md` — fase 9: vigía de fallas e informe de
  salud. Qué cuenta como falla y por qué un escalado correcto no lo es; la
  clasificación mira a dónde iba la llamada; «propone, nunca aplica» pasa de
  promesa a regla del grafo
- `bitacoras/2026/08/2026-08-04_fase-8a.md` — fase 8A: secretos, respaldos con
  restauración verificada (14 tablas, 1016 filas), demo pública por reproducción y
  las reglas de Firestore por fin ejercitadas; los tres checks nuevos comprobados
  fallando, y uno que falló solo
- `bitacoras/2026/07/2026-07-30_cambios.md` — revisión del plan y del panel,
  propuesta de desarrollo, montaje del vault
- `bitacoras/2026/07/2026-07-31_cambios.md` — fase 0 construida: telemetría,
  costeo, migraciones y CI; los checks demostrados fallando; dos defectos
  encontrados y corregidos (una regla que acusaba mal, una prueba que no probaba)
- `bitacoras/2026/07/2026-07-31_fase-1.md` — fase 1 construida: canal Telegram,
  borde endurecido, alcance de contacto en tres capas; 99 pruebas en el CI contra
  Redis y PostgreSQL reales; ocho pruebas que fallaron y por qué eran mías
- `bitacoras/2026/07/2026-07-31_entorno-local.md` — Docker en la máquina de
  desarrollo; la suite completa fuera del CI por primera vez (99 pruebas, 0
  omitidas); el script de pruebas no cargaba `.env` y el documento decía que sí
- `bitacoras/2026/07/2026-07-31_corpus-nimbo.md` — el corpus pasa de clínica
  dental a aseguradora digital; cinco huecos y cinco trampas traducidas al
  dominio nuevo; el léeme no se puede ingerir sin invalidar la fase 2
- `bitacoras/2026/08/2026-08-01_fase-3.md` — fase 3 construida: frontera de salida
  con lista blanca, clasificadores deterministas, saneo y respaldo; el CI de main
  roto por una carrera de migraciones y el primer arreglo que no bastó
- `bitacoras/2026/08/2026-08-01_fase-2.md` — fase 2 construida: 106 fragmentos
  indexados con bge-m3, recuperación con umbral y cita; la medición que demuestra
  que el umbral no basta para el invariante 1 y por qué ningún umbral bastaría

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

**Fases 0 a 9 construidas, salvo 8B.** 473 pruebas más 6 de reglas contra el
emulador de Firestore. El corpus está indexado y se consulta con cita; el
enrutador clasifica, sanea y redacta; los diez vigías actúan; el panel y la demo
por reproducción están en pie. **Y nadie responde todavía en producción**: el
ciclo de caso solo lo invoca el corredor del lote, la cola no tiene lado de
consumo y la tabla `eventos` está vacía — es la fase 11, [[Plan-Lazo-Del-Canal]].
Bloqueantes conocidos: la máquina de referencia para Ollama, que mantiene todo
costo en PROVISIONAL, y la credencial de nube, sin la cual los modos nube e
híbrido nunca se han corrido. Ver [[00-CANON]] §Parte 4.
