-- Perímetro · migración 002 — procedencia del corpus.
--
-- Esta tabla NO guarda el texto ni los vectores. El texto está en la carpeta de
-- ingesta y los vectores en Qdrant; duplicar aquí el contenido crearía una
-- tercera copia que se desincroniza en silencio con las otras dos.
--
-- Lo que guarda es lo que ninguno de los otros dos sitios sabe: **quién puso
-- cada documento, cuándo, y qué suma de verificación tenía cuando se indexó**.
-- De ahí salen dos cosas que la fase 2 pide y una que pedirá la 4C:
--
--   · Reingestión idempotente: si la suma no cambió, no hay nada que reindexar.
--   · Alerta de suma: un documento modificado fuera del flujo de ingestión tiene
--     en disco una suma distinta de la registrada aquí, y eso se detecta
--     comparando, no confiando.
--   · Procedencia para el detector de envenenamiento de la fase 4C, que necesita
--     saber de dónde vino un documento antes de decidir qué hacer con él.
--
-- **No lleva `contacto_id`, y es la primera tabla de datos que no lo lleva.** El
-- corpus es común a todos los contactos: no hay contacto al que acotarlo, y
-- ponerle uno inventado haría que el filtro de alcance dijera algo falso. Por eso
-- `src/repos/documentos.ts` figura explícitamente en la lista de exenciones de la
-- prueba estructural de la fase 1, con este motivo escrito al lado.


CREATE TABLE documentos (
  -- Derivado de la ruta, estable cuando el contenido cambia. Ver
  -- src/core/conocimiento/documento.ts.
  id               TEXT        PRIMARY KEY,
  ruta             TEXT        NOT NULL UNIQUE,
  titulo           TEXT        NOT NULL,
  -- SHA-256 del contenido en bytes, hexadecimal.
  suma             TEXT        NOT NULL,
  origen           TEXT        NOT NULL,
  subido_por       TEXT        NOT NULL,
  -- Cuántos fragmentos produjo la última ingestión. Es el denominador con el que
  -- se comprueba que el índice y la carpeta dicen lo mismo.
  fragmentos       INTEGER     NOT NULL DEFAULT 0,
  bytes            INTEGER     NOT NULL DEFAULT 0,
  -- Qué modelo generó los vectores vigentes. Cambiar de modelo invalida el
  -- índice entero: los vectores de dos modelos distintos no son comparables, y
  -- mezclarlos produce puntuaciones que no significan nada.
  modelo_embeddings TEXT       NOT NULL,
  ingerido_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Última vez que se comprobó la suma contra el disco, para la alerta.
  verificado_en    TIMESTAMPTZ,

  CONSTRAINT documentos_origen_valido
    CHECK (origen IN ('carpeta', 'cloud_storage')),
  CONSTRAINT documentos_suma_es_sha256
    CHECK (suma ~ '^[0-9a-f]{64}$')
);

CREATE INDEX documentos_por_suma ON documentos (suma);

