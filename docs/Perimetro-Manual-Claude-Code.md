# Perímetro — Manual de construcción con Claude Code

Este documento no repite el plan; lo pone a correr. Aquí está cómo ejecutarlo
sesión por sesión.

> [!warning] Corregido el 31‑jul‑2026 — las secciones 1 y 2 ya no describen el repositorio
> Se escribieron antes de que existiera código. Lo que hay en disco manda:
>
> - **La disposición real** es la de [[00-CANON]] §Parte 4 y R‑013: el repositorio
>   es la raíz del vault, con `docs/` y `bitacoras/` dentro y versionados junto al
>   código. No hay subcarpeta `perimetro/`.
> - **`CLAUDE.md` ya existe** en la raíz, y no es el texto de la sección 2. Los
>   invariantes vigentes son los **ocho** de [[00-CANON]] §Parte 2, no los ocho
>   distintos que enumera aquí abajo. **No pegues la sección 2 sobre el archivo
>   real.**
> - **El plan de fases** es [[Propuesta-Desarrollo-Por-Fases]]. Los nombres
>   `docs/fases.md`, `docs/panel-ui.md` y `docs/descripcion.md` que aparecen más
>   adelante nunca llegaron a existir.
> - **La sección 4** («prompts de arranque por fase») describe la numeración del
>   plan original. La vigente está en [[Propuesta-Desarrollo-Por-Fases]] §7 —con
>   4B partida en tres, Telegram en la 3B y una fase 8 de despliegue.
>
> Lo que sigue vigente y es la razón de leer este documento: la **sección 3**
> (protocolo de sesión de cuatro pasos) y la **sección 5** (qué vigilar del propio
> agente). Ambas se cumplieron en la fase 0 y ambas encontraron algo — ver la
> bitácora del 31‑jul‑2026.

---

## 1. Preparación del repositorio

> Superado por R‑013. Se conserva por trazabilidad de la decisión.

```
perimetro/
  CLAUDE.md
  docs/
    fases.md            ← Proyecto1-Prompt-Por-Fases.md
    panel-ui.md         ← Perimetro-Panel-UI.md
    descripcion.md      ← Proyecto1-Descripcion.md
  .claude/
    rules/
```

Guarda los documentos **dentro del repositorio**. Así el agente los lee cuando se los referencias, en lugar de que tengas que pegar el plan completo en cada sesión.

Arranca Claude Code siempre desde la raíz del repositorio. `/memory` te muestra qué archivos de instrucciones están cargados; es lo primero que hay que revisar cuando el agente ignora una regla que creías activa.

---

## 2. CLAUDE.md — pegar tal cual

> ⚠️ **Superado.** El `CLAUDE.md` real está en la raíz del repositorio y deriva de
> [[00-CANON]] §Parte 2. Este bloque se conserva como referencia histórica.

```markdown
# Perímetro

Agente de atención al cliente con enrutamiento híbrido entre modelo local y
modelo en la nube, instrumentado para auditar costo y salida de datos.

El plan completo está en @docs/fases.md. La especificación del panel está en
@docs/panel-ui.md. No inventes alcance que no esté en esos documentos.

## Invariantes — nunca se rompen

1. Ninguna ruta de ejecución termina sin emitir su evento de telemetría.
2. Sin fuente recuperada por encima del umbral, el agente no responde: escala.
3. Los datos de sensibilidad alta no salen del perímetro. Nunca.
4. Toda salida al usuario valida contra un esquema declarado.
5. Ningún proveedor de LLM se importa dentro de la lógica de negocio.
6. Clasificar, enrutar, validar y calcular ocurre en código, no en el modelo.
7. Todo umbral tiene un vigía con acción declarada: avisa, degrada o detiene.
8. Los vigías son deterministas. Nunca un modelo juzgando a otro.

## Convenciones

- Node.js + TypeScript estricto. Sin `any`.
- PostgreSQL para estado y telemetría. Redis para colas. Qdrant para vectores.
- Precios, umbrales y política de enrutamiento en configuración, jamás en código.
- Nombres de dominio en español; nombres de tipos y funciones en inglés.
- Cada módulo con su prueba. Sin prueba, la fase no está terminada.

## Prohibido

- Hojas de cálculo como almacén de datos de clientes.
- Cifras inventadas en el panel o en la documentación. Todo número sale de una
  ejecución registrada.
- Construir un CRM. Solo la interfaz de tres métodos y sus adaptadores.
- Instalar dependencias nuevas sin proponerlas y esperar aprobación.
- Avanzar a la siguiente fase sin que pasen los criterios de aceptación.

## Definición de terminado

Una fase está terminada cuando: sus criterios de aceptación tienen prueba
automatizada que pasa, el código no rompe pruebas de fases anteriores, y existe
una nota breve de lo que quedó fuera y por qué.
```

---

## 3. Protocolo de sesión

Una sesión por fase. Siempre el mismo ciclo de cuatro pasos:

**Paso 1 — Plan antes que código.**

> Lee `@docs/fases.md`, fase N. No escribas código todavía. Dame el plan: qué
> archivos vas a crear o tocar, qué pruebas vas a escribir para cada criterio de
> aceptación, y qué decisiones necesitas que yo tome antes de empezar.

Revisa el plan. Aquí es donde corriges el rumbo barato; después ya no lo es.

**Paso 2 — Pruebas primero, en los criterios que importan.**

> Escribe primero las pruebas de los criterios de aceptación de la fase. Que
> fallen. Después implementa hasta que pasen.

Esto importa especialmente en las fases 3, 4, 4B y 4C: son reglas de seguridad, y
una regla de seguridad sin prueba que la ejercite no existe.

**Paso 3 — Implementación acotada.**

> Implementa solo la fase N. Si detectas algo necesario que pertenece a otra
> fase, anótalo en `docs/pendientes.md` en lugar de construirlo.

El desbordamiento de alcance es el modo de falla número uno cuando se construye
con un agente. Es rápido y complaciente, y con gusto te construye la fase 6
mientras estabas en la 2.

**Paso 4 — Puerta de verificación.**

> Corre todas las pruebas. Muéstrame qué criterio de aceptación cubre cada una.
> Dime qué quedó fuera. No hagas commit hasta que yo lo apruebe.

Un commit por fase, con el número de fase en el mensaje. Así puedes volver.

---

## 4. Prompts de arranque por fase

Cada uno se pega al inicio de su sesión, después del paso 1.

**Fase 0 —** Cimientos, esquema de telemetría, función de costeo, migraciones.
Ojo: la prueba clave es la que falla si alguna ruta termina sin emitir evento.

**Fase 1 —** Canal de WhatsApp, encolamiento con ventana de agrupación,
normalización a mensaje canónico. Verifica que el núcleo no importe nada de
WhatsApp.

**Fase 2 —** Ingestión, troceado, embeddings, recuperación con umbral y cita
obligatoria. La prueba que importa: una pregunta sin respuesta en el corpus
devuelve vacío, no un fragmento forzado.

**Fase 3 —** Enrutador. Clasificadores de tarea y sensibilidad, política
declarativa, capa de saneo, adaptadores de proveedor. Prueba obligatoria: una
petición sensible no produce ninguna llamada externa.

**Fase 4 —** Validación de esquema, verificador de sustento, umbrales, cola de
escalado.

**Fase 4B —** Los once vigías. Cada uno con su prueba de inyección de fallo.
Sesión larga; considera partirla en dos, los de negocio y los técnicos.

**Fase 4C —** Ciberseguridad. Primero las tres restricciones estructurales
—destinatario fijado por el sistema, filtro de contacto en el repositorio, lista
blanca de salida— y después los detectores. En ese orden.

**Fase 5 —** Acciones, idempotencia, interfaz `CRM` de tres métodos con
PostgreSQL por defecto.

**Fase 6 —** El panel, siguiendo `@docs/panel-ui.md`. La maqueta de la pantalla
de Operación ya existe: pásala como referencia de composición, no la reescribas
desde cero.

**Fase 7 —** Lote de casos, corredor, reporte comparativo. De aquí salen todas
las cifras publicables.

**Fase 8 —** Telegram y voz. Telegram primero, porque valida que la abstracción
de canal funciona.

---

## 5. Lo que hay que vigilar del propio agente

- **Complacencia.** Si le preguntas "¿está bien esto?", va a decir que sí. Pídele
  en cambio que encuentre los tres puntos más débiles de lo que acaba de escribir.
- **Pruebas que no prueban.** Revisa que las aserciones ejerciten la regla, no que
  la función no lance excepción. Es el fallo más común y el más silencioso.
- **Cifras de relleno.** En cuanto toque el panel va a querer poner datos de
  ejemplo bonitos. Todo dato inventado se marca visiblemente como demostración o
  no entra.
- **Dependencias de más.** Cada paquete nuevo se propone y se aprueba. Un proyecto
  que presume de control del dato no puede tener doscientas dependencias.
- **Contexto largo.** Al final de una fase, cierra la sesión y abre otra. Arrastrar
  el contexto de tres fases degrada las decisiones.
