# Perímetro

Agente de atención al cliente con enrutamiento híbrido entre modelo local y modelo
en la nube, instrumentado para auditar costo y salida de datos.

**La verdad única del proyecto es @docs/00-CANON.md.** El plan por fases está en
@docs/Propuesta-Desarrollo-Por-Fases.md y el protocolo de sesión en
@docs/Perimetro-Manual-Claude-Code.md. No inventes alcance que no esté en esos
documentos.

Si algo de la documentación choca con el código, **gana el código** y el documento
se corrige el mismo día, con entrada en @docs/CALL_CENTRE_DOCS.md.

## Los ocho invariantes — nunca se rompen

1. **Sin fuente no hay respuesta.** Si la recuperación no devuelve un fragmento por
   encima del umbral, el agente lo dice y escala. Nunca completa con conocimiento
   del modelo.
2. **Toda salida cumple un esquema declarado.** Lo que no valida no llega al
   usuario: se descarta y se registra.
3. ⚙️ **Cero salida de datos sensibles sin enmascarar.** Toda llamada externa pasa
   por la capa de saneo. Se registra qué salió y hacia dónde.
4. ⚙️ **Agnóstico al proveedor.** Ninguna clase del dominio importa el SDK de un
   proveedor. Cambiar de modelo es configuración, no reescritura.
5. ⚙️ **Todo evento se instrumenta.** Ninguna ruta de ejecución puede terminar sin
   emitir su evento de telemetría — ni sin emitirlo dos veces.
6. **Determinismo primero.** Clasificar, enrutar, validar y calcular ocurre en
   código auditable. El modelo redacta; no decide.
7. **Todo límite tiene un vigía**, con umbral y acción declarada: avisa, degrada o
   detiene. Los vigías son código determinista; jamás un modelo juzgando a otro.
8. ⚙️ **La proyección es de un solo sentido.** Firebase nunca escribe en el
   perímetro. El publicador es el único con permiso de escritura sobre Firestore y
   corre dentro del perímetro.

Higiene, también mecanizada: sin `any`, y sin credenciales en el repositorio.

Los ⚙️ tienen comprobación automática que bloquea el merge. `npm run verificar`
los corre todos. **No los desactives para que pase un cambio**: si un check
estorba, el cambio está mal o el check está mal, y las dos cosas se discuten
antes de tocarlas.

## Convenciones

- Node.js + TypeScript estricto. **Sin `any`.**
- El código se ejecuta con el intérprete de TypeScript de Node; por eso la sintaxis
  debe ser borrable (`erasableSyntaxOnly`): sin `enum`, sin `namespace`, sin
  propiedades de parámetro en constructores. Usa objetos `as const` y uniones.
- Los imports relativos llevan extensión `.ts`.
- PostgreSQL para estado y telemetría. Redis para colas. Qdrant para vectores.
- Precios, umbrales y política de enrutamiento en `config/`, jamás en código.
- **Nombres de dominio en español; nombres de tipos y funciones en inglés** salvo
  cuando el término es del dominio (`Vigia`, `AlcanceContacto`, `costear`).
- Cada módulo con su prueba, en `tests/`, con `node:test`. Sin prueba, la fase no
  está terminada.

## Fronteras de código, y quién las vigila

| Frontera | Regla | Check |
|---|---|---|
| `src/core/**` | No importa SDKs de proveedor ni `src/providers/**` | `check:arquitectura` |
| `src/repos/**` | Única capa que importa el cliente de PostgreSQL | fase 1 |
| Costeo | Toda aritmética de precios vive en `src/core/costeo/` | `check:lint` |
| Salida externa | Un único módulo con lista blanca; `fetch` prohibido fuera | fase 3 |
| `panel/**` | React. Es el **único** lugar del repositorio donde entra React | fase 6 |

El núcleo es Node/TS sin framework de interfaz. `src/**` no importa React ni nada
de `panel/`, y `panel/**` no importa `src/**`: el panel lee la proyección de
Firestore, nunca el perímetro.

## Prohibido

- Hojas de cálculo como almacén de datos de clientes.
- **Cifras inventadas** en el panel o en la documentación. Todo número sale de una
  ejecución registrada. Los datos de demostración viven en un único módulo cuya
  activación renderiza la banda de demostración automáticamente.
- Construir un CRM. Solo la interfaz de tres métodos y sus adaptadores.
- **Instalar dependencias nuevas sin proponerlas y esperar aprobación.**
- Avanzar a la siguiente fase sin que pasen los criterios de aceptación.
- Reimplementar el costeo. La calculadora de la fase 6B importa `costear`.

## Protocolo de trabajo

Una rama y un PR por fase: `fase/N-nombre`. `main` protegida, historial lineal,
squash merge, etiqueta `v0.N` al cerrar. **La rama es la unidad de retroceso**: si
una fase no pasa sus criterios al tercer intento, se descarta la rama entera, no se
parchea `main`.

Lo que pertenece a otra fase no se construye: se abre un issue con la etiqueta de
la fase destino.

## Definición de terminado

Una fase está terminada cuando sus criterios de aceptación tienen prueba
automatizada que pasa, el código no rompe pruebas de fases anteriores, y existe una
nota escrita de **qué quedó fuera y por qué**.
