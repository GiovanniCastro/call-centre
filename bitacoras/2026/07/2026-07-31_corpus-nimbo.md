# Perímetro · 31 de julio de 2026 — corpus de Nimbo Seguros

> Parte de la jornada. Toda cifra está medida contra el repositorio o contra una
> ejecución registrada; ninguna está estimada.

Cuarta bitácora del día. Sustituye el corpus de la fase 2 por completo: la
Clínica Dental Aurora deja paso a **Nimbo Seguros**, aseguradora digital
ficticia. Decisión del responsable, registrada en R‑023.

---

## Qué se hizo

**Diecisiete documentos nuevos, más el léeme.** 1 241 líneas, 9 102 palabras.
Mercado estadounidense, cifras en dólares, redactados en español. Cinco ramos:
inquilino, propietario, mascotas, vida a término y auto.

La referencia es Lemonade, y conviene precisar en qué: **el modelo de negocio, no
el contenido**. Comisión fija del 25 %, catálogo corto de ramos personales,
contratación y siniestros por aplicación, sobrante anual donado a la causa que
elige el cliente. Ni una línea sale de una póliza real, y la petición automática
a su web devolvió 403, así que tampoco se leyó de ahí.

### Por qué el dominio cambia lo que se puede probar

La clínica respondía preguntas planas: cuánto cuesta una limpieza, a qué hora
abren. Casi todo eran datos únicos sin condiciones. En seguros, «¿está cubierto?»
depende del ramo, del estado, del deducible y de si el hecho encaja en una
exclusión — que es la forma que tiene el trabajo real de este agente.

Lo que más pesa es la **sensibilidad**. `16-proteccion-de-datos.md` enumera lo que
la aseguradora pide en cada ramo: número de seguro social, carné de conducir,
número de bastidor, cuenta bancaria, cuestionario de salud, historial
veterinario. El vigía de perímetro de la fase 4B‑1 tiene que poder enseñar «31 de
31 retenidos», y para eso hacen falta casos de sensibilidad alta que salgan del
corpus y no de la imaginación de quien escriba el lote.

### Las cinco trampas, traducidas

Se conservan una por una. Dos ganan fuerza con el cambio de dominio:

- **La excepción de cancelación** (`09-cancelacion-y-reembolsos.md`) pasa a ser la
  trampa más peligrosa. La regla general promete reembolso prorrateado; dos
  secciones después, la excepción lo niega si hubo un siniestro pagado. Citar la
  regla e ignorar la excepción produce una respuesta **que suena correcta y cuesta
  dinero**. En la clínica, el equivalente costaba una cita.
- **La tabla de cobertura por estado** (`10-cobertura-por-estado.md`) son doce
  estados por cinco ramos con seis notas al pie que se solapan, y **se declara con
  precedencia sobre los documentos de producto**. Resolver bien un conflicto exige
  respetar esa precedencia, no promediar las dos fuentes.

Las otras tres —precio duplicado en dos documentos, fecha de vigencia explícita,
documento envenenado— se mantienen en la misma forma.

### Los huecos pasan de cuatro a cinco

Motocicletas y embarcaciones · vida entera y universal · mascotas que no sean
perro o gato · el precio de la póliza de inundación · el recargo de los
conductores menores de 25 años.

Comprobado con `grep` sobre la carpeta: **ninguno de los cinco aparece contestado
en los diecisiete documentos**. Solo aparecen en el léeme, que es precisamente el
motivo del apartado siguiente.

## Un defecto de R‑022 que salió al escribir el sustituto

`00-LEEME.md` enumera los huecos deliberados y las trampas. **Si se ingesta con el
resto de la carpeta, el corpus se contesta a sí mismo**: una pregunta sobre
motocicletas recupera el párrafo que explica que las motocicletas son un hueco a
propósito, y el criterio de aceptación de la fase 2 —«una pregunta sin respuesta
devuelve vacío»— queda invalidado por su propia documentación.

El corpus anterior tenía exactamente el mismo defecto y nadie lo vio, porque la
ingestión no existe todavía y nunca llegó a ejecutarse contra él.

**La ingestión de la fase 2 excluye todo archivo cuyo nombre empiece por `00-`.**
Queda escrito en el léeme y como punto de construcción en la fase 2 de
[[Propuesta-Desarrollo-Por-Fases]], no como convención de nombres sino como
restricción de la ingestión.

## Qué se tocó fuera del corpus

- [[00-CANON]] §Parte 4 — el bloqueante retirado ahora nombra a Nimbo y a R‑023.
- [[Propuesta-Desarrollo-Por-Fases]] fase 2 — el entregable pasa de clínica a
  aseguradora, y se añade la exclusión de los archivos meta.
- `tests/canales.test.ts` — el mensaje de ejemplo preguntaba por una limpieza
  dental; ahora pregunta por el seguro de inquilino. Cosmético: la prueba mide
  firma y agrupación, no contenido.

**Ninguna línea de `src/` cambia.** El corpus todavía no tiene código que lo lea.

## Qué quedó abierto

- **El corpus no se ha ingerido nunca.** Está escrito, no probado. Hasta que la
  fase 2 lo trocee y lo indexe, no se sabe si las trampas disparan lo que deben.
  Es la diferencia entre un corpus y un corpus verificado.
- **Los casos de la fase 7 hablan de otra cosa ahora.** No hay ninguno escrito
  todavía, así que no se pierde trabajo; pero el lote de cincuenta a cien casos se
  escribirá contra seguros.
- **Nada valida el formato de los documentos.** Los encabezados de procedencia
  —fecha de revisión y responsable— son convención, no esquema. Si la fase 2 va a
  citarlos, conviene que una prueba compruebe que los diecisiete los tienen.

## Entradas de manual generadas

- [[CALL_CENTRE_DOCS]] R‑023 · El corpus pasa de clínica dental a aseguradora
  digital

R‑022 se conserva con una nota de sustitución: su mecanismo —huecos, trampas,
documento envenenado, aviso de ficción— sigue vigente palabra por palabra, y es
lo que R‑023 hereda.
