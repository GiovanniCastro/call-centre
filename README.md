# Perímetro

Agente de atención al cliente con enrutamiento híbrido entre modelo local y modelo
en la nube, instrumentado para auditar costo y salida de datos.

**La tesis.** Cada tarea se ejecuta en el lugar que le corresponde, y el operador
conserva el interruptor. El valor no está en que el agente responda; está en que
cada respuesta sea **rastreable, costeable y auditable**.

> **Estado: fase 0 de 16.** Existen el contrato de datos, la telemetría, el costeo
> y el andamiaje. **Nada responde todavía a un usuario:** no hay canal, ni
> recuperación, ni enrutador. El estado real, medido contra el disco y no copiado
> de ningún otro documento, está en [`docs/00-CANON.md`](docs/00-CANON.md) §Parte 4.

---

## Los ocho invariantes

Nunca se rompen. Los marcados con ⚙️ tienen comprobación automática que **bloquea
el merge**; no dependen de que alguien se acuerde.

1. **Sin fuente no hay respuesta.** Si la recuperación no devuelve un fragmento
   por encima del umbral, el agente lo dice y escala. Nunca completa con
   conocimiento del modelo.
2. **Toda salida cumple un esquema declarado.** Lo que no valida no llega al
   usuario: se descarta y se registra.
3. ⚙️ **Cero salida de datos sensibles sin enmascarar.** Se registra qué salió y
   hacia dónde.
4. ⚙️ **Agnóstico al proveedor.** Ninguna clase del dominio importa el SDK de un
   proveedor. Cambiar de modelo es configuración, no reescritura.
5. ⚙️ **Todo evento se instrumenta.** Ninguna ruta puede terminar sin emitir su
   evento de telemetría — ni emitirlo dos veces.
6. **Determinismo primero.** Clasificar, enrutar, validar y calcular ocurre en
   código auditable. El modelo redacta; no decide.
7. **Todo límite tiene un vigía**, con umbral y acción declarada: avisa, degrada o
   detiene. Los vigías son código determinista; jamás un modelo juzgando a otro.
8. ⚙️ **La proyección es de un solo sentido.** Firebase nunca escribe en el
   perímetro.

## Cómo se defienden solos

Un proyecto cuya tesis es «todo umbral tiene un vigía» no puede dejar sus propios
umbrales a la buena voluntad. Cada invariante ⚙️ es una comprobación que corre en
cada PR:

| Invariante | Comprobación |
|---|---|
| 4 · Agnóstico al proveedor | `dependency-cruiser` sobre el grafo completo — atrapa el camino de tres saltos que un lint de archivo no ve |
| 5 · Todo evento se instrumenta | Un arnés envuelve el emisor y falla si un caso emite cero eventos o dos, **incluidas las rutas que terminan en excepción** |
| 1 y 3 · Fuente y egreso | Restricciones del esquema **y** `CHECK` en PostgreSQL: la regla que solo vive en la aplicación se salta con un `psql` |
| 8 · Proyección de un solo sentido | Solo `proyeccion/` puede importar el SDK de Firebase |
| Sin `any` | `tsc --strict` + `@typescript-eslint/no-explicit-any` en `error` |
| Sin credenciales | `gitleaks` con historial completo + protección de empuje de GitHub |

Y una que no es un invariante pero evita el defecto más caro: **la función de
costeo es la única fuente de costo**. Un lint falla si aparece aritmética de
precios fuera de ese módulo, de modo que la calculadora de punto de equilibrio de
la fase 6B tendrá que importarla en lugar de reimplementarla — que es como dos
pantallas acaban mostrando dos cifras para lo mismo.

Los checks se demostraron **fallando** antes de darlos por buenos: la salida real
está en la [bitácora del 31‑jul](bitacoras/2026/07/2026-07-31_cambios.md).

## Arquitectura en dos planos

```
┌─ PERÍMETRO (autoalojado) ──────────────────────────────┐
│  núcleo Node/TS   PostgreSQL   Redis   Qdrant  Ollama  │
│  canales · enrutador · validación · vigías · acciones  │
│              publicador (un solo sentido)              │
└───────────────────────────┬────────────────────────────┘
                            │  agregados + trazas saneadas
                            ▼
┌─ PRESENTACIÓN (Firebase) ──────────────────────────────┐
│  Hosting · Auth · Firestore (solo lectura) · App Check │
└────────────────────────────────────────────────────────┘
```

El panel público no tiene acceso a la base de datos: solo a una proyección de la
que se han retirado los datos. **La demo no ejecuta inferencia en vivo** —
reproduce ejecuciones registradas, así que no consume presupuesto por visitante,
no expone el webhook y no depende de que la máquina con Ollama esté encendida.

## Qué hay construido

```
config/       precios y supuestos de costeo, versionados
migrations/   contactos, conversaciones, mensajes, eventos, prospectos
src/
  core/costeo/    fuente única de costo — devuelve el monto y sus supuestos
  telemetry/      esquema del evento, emisor y arnés de instrumentación
tests/        28 pruebas
docs/         el canon, el plan por fases y el manual de cambios
bitacoras/    parte de cada jornada, con lo medido y lo que quedó abierto
```

Vacíos hasta su fase: `src/channels/` (1), `src/providers/` (3), `src/repos/` (1),
`panel/` (6), `proyeccion/` (6), `lote/` (7).

## Correr las comprobaciones

```bash
npm ci
npm run verificar    # tipos + lint + arquitectura + pruebas
```

Requiere Node ≥ 22.18. No hay paso de compilación: Node interpreta TypeScript
directamente, por lo que el código usa solo sintaxis borrable — sin `enum`, sin
`namespace`, sin propiedades de parámetro.

## Cómo se trabaja aquí

Una rama y un PR por fase, con los criterios de aceptación como casillas y dos
campos obligatorios: **qué invariante toca** y **qué quedó fuera y por qué**.
`main` protegida, historial lineal, y la protección **aplica también a
administradores** — un push directo se rechaza siendo el dueño del repositorio.

Si una fase no pasa sus criterios al tercer intento, se descarta la rama entera;
no se parchea `main`. Y un criterio relajado en silencio es deuda invisible: se
registra o no se relaja.

**Ninguna cifra sin ejecución detrás.** Si un número no sale de una corrida
registrada o de una consulta a la base, no entra en el panel ni en la
documentación. Los datos de demostración del panel vivirán en un único módulo cuya
activación renderiza la banda de «datos de demostración» automáticamente: no se
puede tener cifras falsas sin la etiqueta, porque la misma bandera controla las
dos cosas.

## Documentación

| | |
|---|---|
| [`docs/00-CANON.md`](docs/00-CANON.md) | **Verdad única.** Qué es, los invariantes, el stack, el estado real y las decisiones tomadas. Si choca con el código, gana el código |
| [`docs/Propuesta-Desarrollo-Por-Fases.md`](docs/Propuesta-Desarrollo-Por-Fases.md) | Las dieciséis fases con sus criterios de aceptación |
| [`docs/CALL_CENTRE_DOCS.md`](docs/CALL_CENTRE_DOCS.md) | Manual de cambios: cada decisión con su porqué y su alternativa descartada |
| [`docs/REFERENCIA-N8N.md`](docs/REFERENCIA-N8N.md) | El flujo del que venimos, y por qué no entra en el stack |

---

Giovanni Castro · [github.com/GiovanniCastro/perimetro](https://github.com/GiovanniCastro/perimetro)
