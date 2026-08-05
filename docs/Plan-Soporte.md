# Perímetro — Plan de soporte · fase 13 y el plano de control

> **Estado: PROPUESTO.** Nada construido. Va después de [[Plan-Lazo-Del-Canal]].
>
> Este documento resuelve una pregunta que quedó abierta: «este proyecto es el
> modelo del cliente; luego hay que crear una para el soporte del cliente, estilo
> Uber». La decisión está tomada en §2 y razonada. Decisiones en
> [[CALL_CENTRE_DOCS]] R‑060 y R‑061.

---

## 1. Lo que es cierto antes de decidir nada

La tabla `escalados` existe desde la fase 4 y [repos/escalados.ts](../src/repos/escalados.ts)
la escribe con motivo, transcripción y contexto, que es lo que pedía el criterio
«el caso escalado conserva el hilo completo».

**Y ninguna pantalla la lee.** El panel publica el agregado «por qué se escaló»,
no la cola. En la corrida vigente del lote eso son **41 casos de 65** que caen en
una bandeja que nadie abre.

Sea cual sea el modelo de negocio, esa consola hay que construirla. No estaba en
ningún plan.

---

## 2. La decisión: las dos, y en este orden

«Soporte del cliente» admitía dos lecturas y llevan a productos distintos:

| Lectura | Quién se sienta delante | Qué es en la analogía |
|---|---|---|
| **A. La bandeja del operador** | El empleado del negocio que atiende lo que el agente escaló | El segundo rol de la misma plataforma: pasajero y conductor |
| **B. El plano de control** | Tú, atendiendo a los negocios que te contratan | Uber la empresa, mirando su flota |

**Se hacen las dos, y A va primero.** Tres razones:

**A ya tiene tráfico y B no.** Hoy 41 de 65 casos escalan y nadie los ve. B no
tiene nada que mostrar hasta que exista más de un cliente.

**A es lo que hace vendible el producto.** Un agente que escala el 63 % sin un sitio
donde se atienda ese 63 % no es un producto: es una demo. B mejora tu operación,
no la del cliente.

**B es más barato después de A.** Casi todo lo que el plano de control necesita
—salud, costo, vigías, incidentes, presupuesto consumido— ya lo producen el
informe de la fase 9 y la proyección de la fase 6. B es sobre todo agregación de
proyecciones existentes.

**Y B no te obliga a multi‑tenant.** Un plano de control que **solo lee
proyecciones** es compatible con un perímetro por cliente: cada uno conserva su
máquina y sus datos, y tú lees lo que cada publicador dejó saneado. Es el
invariante 8 aplicado una vez más, no una excepción a él.

---

## 3. La regla que ordena las tres pantallas: el panel lee, el perímetro escribe

Tres funciones distintas han llegado a la misma frontera en la misma semana: la
tuerca de configuración de credenciales, el perfil de negocio y ahora la bandeja
del operador. Conviene enunciar la regla una vez en lugar de decidirla tres.

> **El panel de Firebase lee. Todo lo que escribe vive dentro del perímetro.**

No es una preferencia: es el invariante 8. Y tiene una consecuencia práctica
cómoda — **la mitad de lectura de cada función sí puede ir al panel**, detrás del
rol que le toque:

| Función | Lectura, en el panel | Escritura, en el perímetro |
|---|---|---|
| Credenciales | Qué está puesto y qué falta, nunca el valor | El `.env` de la máquina |
| Perfil de negocio | El perfil vigente y el corpus indexado | El archivo versionado y la ingestión |
| Bandeja de escalados | La cola con su hilo y sus fuentes | La respuesta del operador |

---

## 4. Fase 13A — El escalado llega a un humano por un canal que ya existe

**La vía cara, descartada de momento.** Construir una consola propia con su
autenticación, su tiempo real y su ciclo de vida. Son varias sesiones y hay algo
que da el 80 % en una.

**Construir.**

- Un **canal humano** —un grupo de Telegram del negocio— al que el escalado llega
  con lo que la fase 4 ya guarda: el hilo, el motivo, las fuentes que se
  recuperaron y por qué no bastaron.
- El operador **responde en ese hilo**, y la respuesta vuelve al cliente por el
  canal original. El destinatario **lo fija el sistema** desde el identificador del
  escalado, nunca el texto del operador — es la misma restricción de firma que la
  fase 5 puso a las herramientas.
- El escalado se cierra con quién lo atendió y cuándo. Sin eso no hay tiempo de
  respuesta humano, que es la mitad del KPI que el panel promete.

**Por qué esto y no una consola.** Usa la interfaz `Canal` que ya existe y que la
fase 3B demostró que admite canales nuevos sin tocar `src/core/`. No añade
superficie expuesta, no añade autenticación y no añade despliegue. Y es como
trabaja de verdad una pyme de cinco personas.

**Criterios de aceptación.**

- Un caso escalado aparece en el canal humano con **el hilo entero y sus fuentes**.
- La respuesta del operador llega al cliente correcto. Prueba explícita con dos
  escalados abiertos a la vez: el cruce es el fallo que hay que hacer imposible.
- **Ningún operador puede responder a un contacto que no sea el del escalado.**
  Prueba con una respuesta que intenta indicar otro destinatario.
- El escalado queda cerrado con operador y marca de tiempo, y el tiempo de
  respuesta humano sale de ahí y de ningún otro sitio.
- Nada de esto pasa por Firebase.

---

## 5. Fase 13B — La bandeja propia, cuando el volumen la pida

**Cuándo.** Cuando un negocio tenga más escalados de los que caben en un hilo, o
cuando pida ver la cola sin abrir Telegram. No antes: una consola sin volumen es
una consola que nadie abre y que hay que mantener igual.

**Construir.**

- **Lectura en el panel**, detrás del rol `trazas` de la fase 6: la cola con su
  hilo, sus fuentes y su estado, publicada por la proyección y saneada como todo
  lo demás.
- **Escritura servida por el perímetro**, en `localhost` o red interna: la respuesta
  y el cierre. Nunca por Hosting.
- Registro de acceso, incluidas las lecturas — la tabla `accesos_panel` ya existe
  desde la fase 6 y ya distingue los dos roles.

**Criterios de aceptación.**

- Una prueba en el emulador falla si un cliente autenticado puede escribir en la
  cola publicada.
- Un rol de métricas no ve el contenido de un escalado, solo su recuento. Es el
  criterio de la fase 6 aplicado a una superficie nueva.
- Quién atendió qué escalado queda registrado y es consultable.

---

## 6. El plano de control: producto aparte, no fase de este repositorio

**Qué es.** Una pantalla sobre N perímetros que responde a una sola pregunta:
**cuál de mis clientes necesita atención hoy.** Disponibilidad, tasa de error,
presupuesto consumido, vigías que actuaron, incidentes de seguridad abiertos.

**De dónde saca los datos.** De las proyecciones que cada perímetro ya publica. El
informe de salud de la fase 9 produce el encabezado entero —disponibilidad, tasa
de error, tiempo medio de recuperación, presupuesto de error— y ya está saneado
por criterio de aceptación: «ninguna traza, mensaje ni caso de reproducción
contiene datos de un cliente».

**Tres reglas que no se negocian.**

1. **Solo lee.** Nada de reiniciar servicios, rotar claves ni cambiar umbrales en
   remoto. Un plano de control con escritura es una llave maestra a todos los
   perímetros de todos tus clientes, y la existencia de esa llave se le puede
   preguntar a un cliente en una auditoría.
2. **Lee proyecciones, nunca bases.** No hay una credencial de PostgreSQL de un
   cliente en tu máquina.
3. **Vive en otro repositorio.** Este repositorio es un perímetro: uno. Meter aquí
   una consola multi‑cliente rompería en el propio código la historia que el
   producto cuenta, y el check de arquitectura no tendría dónde apoyarse.

**Cuándo.** Cuando haya un segundo cliente. Antes es una pantalla con una fila.

---

## 7. Lo que este plan no hace

- **No convierte el perímetro en multi‑tenant.** Ver [[Plan-Perfil-De-Negocio]] §10.
- **No construye un CRM** para el operador: ni embudos, ni asignación por equipos,
  ni informes de productividad. La cola, el hilo, la respuesta y el cierre.
- **No añade tiempo real** en 13A. Un hilo de Telegram ya lo es.
