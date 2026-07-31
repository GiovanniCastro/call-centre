# 🔁 REFERENCIA — el flujo de n8n del que venimos

> **n8n no forma parte de este proyecto.** Ni como plomería de canales. Esta nota
> existe porque el flujo de n8n **ya funciona** y es la mejor especificación viva
> que tenemos: dice qué hace falta construir. Lo que no dice es cómo, porque
> varias de sus decisiones son exactamente las que [[00-CANON]] prohíbe.

Fuente: cinco capturas del lienzo, archivadas fuera del repositorio.

---

## Lo que hay en el lienzo

**Asistente de Voz — VAPI.** Un agente de voz conectado a un modelo de chat, con
MCPs de Gmail, Calendario y Contactos, envío por WhatsApp, y respuesta al webhook.

**Telegram y WhatsApp.** Dos lienzos **casi idénticos**, cada uno con tres bloques:
entrada de datos, *encolamiento de mensajes* (con debounce y unión de mensajes
sucesivos), y *procesamiento del mensaje* ramificado por tipo — texto, audio,
imagen y documentos, con descarga y extracción de PDF y TXT.

**AI AGENT.** Entrada, extracción de información, búsqueda en la base, cálculo de
valores, un agente con memoria de chat en PostgreSQL, MCPs, agente RAG de
conocimiento, y una herramienta de diccionario avanzado. Salida hacia un
**Verificador de Respuesta** con *Auto Fixing Output Parser*, y de ahí a dos ramas
de respuesta, una por canal.

**Carga Documentos RAG.** Drive vigilado → descarga → extracción de PDF → troceado
→ embeddings → vector store.

---

## Qué confirma

Estas piezas del plan no son teóricas: ya están probadas en producción.

| En el lienzo | En el plan |
|---|---|
| Encolamiento con debounce por canal | Fase 1 — ventana de agrupación en Redis |
| Ramificación por tipo de mensaje | Fase 1 — normalización a mensaje canónico |
| Memoria de chat en PostgreSQL | Fase 1 — estado conversacional |
| Carpeta vigilada → trocear → embeddings → vector store | Fase 2, tal cual |
| MCPs de Calendario, Gmail, Contactos | Fase 5 — herramientas con efectos |
| Verificador entre el agente y la respuesta | Fase 4 — validación antes de enviar |

---

## Qué hace mal, y qué hacemos en su lugar

Esto es lo valioso de la referencia: los tres sitios donde hay que desviarse.

**Uno · El verificador es un modelo arreglando a otro modelo.**
El *Auto Fixing Output Parser* toma la salida del agente y le pide a un modelo que
la corrija hasta que encaje. Eso viola el invariante 7 —jamás un modelo juzgando a
otro— y produce una respuesta que *parece* válida sin que nadie haya comprobado
que lo que afirma está en las fuentes. **En su lugar**: el modelo emite una
estructura donde cada dato factual lleva su `fragmento_id`, y el verificador
comprueba en código que el id existe, que se recuperó en esta ejecución y que el
valor aparece literalmente en el fragmento. Es un `join`, no una segunda opinión.
Ver [[00-CANON]] §Glosario · Procedencia.

**Dos · Cada canal tiene su propio procesamiento duplicado.**
Los lienzos de Telegram y WhatsApp son el mismo grafo dos veces. Cualquier cambio
hay que hacerlo dos veces, y tarde o temprano solo se hace en uno. **En su lugar**:
la interfaz `Canal` de la fase 1, con un único núcleo, y la fase 3B (Telegram) como
prueba de que la abstracción aguanta.

**Tres · No hay costo, ni telemetría, ni vigías.**
El lienzo responde bien y no sabe cuánto costó, dónde se ejecutó, ni qué salió del
perímetro. Ese es literalmente el producto que estamos construyendo: no es que a
n8n le falte, es que ese hueco **es** Perímetro. La fase 0 se construye primero
por esto.

---

## Qué se rescata tal cual

- **La forma de las herramientas** de Calendario y Contactos: qué operaciones hacen
  falta de verdad. Sirve de lista de partida para la fase 5, con una corrección
  obligatoria: en Perímetro **ninguna herramienta acepta el destinatario desde el
  texto**; lo fija el sistema.
- **El manejo de audio, imagen y documentos** en la entrada. Es más completo de lo
  que el plan describe en la fase 1, y conviene copiar esa cobertura.
- **VAPI** como opción concreta para la fase 10, en lugar de montar transcripción y
  síntesis desde cero.

---

## Migración

No hay migración. Perímetro se construye desde cero según
[[Propuesta-Desarrollo-Por-Fases]]. El flujo de n8n puede seguir corriendo en
paralelo mientras tanto, y de hecho conviene: es el patrón contra el que comparar
las respuestas del lote de la fase 7.
