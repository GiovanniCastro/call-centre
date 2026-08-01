-- Perímetro · migración 004 — acciones, citas e idempotencia.
--
-- La tabla `operaciones` es el mecanismo de idempotencia, y su forma es la
-- decisión de esta migración: se registra **antes y después**, no solo después.
--
-- Registrar solo al terminar deja invisible el caso peor: la acción se ejecutó,
-- el proceso murió antes de anotarlo, y el reintento la ejecuta otra vez. Con la
-- fila escrita ANTES, un reintento encuentra `iniciada` y sabe que alguien ya
-- estaba en ello — que no es lo mismo que «no se ha hecho», y tratarlo igual es
-- exactamente cómo se crean dos citas.

CREATE TABLE operaciones (
  clave        TEXT        PRIMARY KEY,
  contacto_id  UUID        NOT NULL REFERENCES contactos(id) ON DELETE RESTRICT,
  herramienta  TEXT        NOT NULL,
  estado       TEXT        NOT NULL DEFAULT 'iniciada',
  -- Lo que devolvió, para poder responder lo mismo a un reintento en vez de
  -- volver a ejecutar. Un reintento idempotente que devuelve vacío obliga a
  -- quien llama a distinguir «ya estaba hecho» de «no devolvió nada».
  resultado    JSONB,
  error        TEXT,
  iniciada_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminada_en TIMESTAMPTZ,

  CONSTRAINT operaciones_estado_valido
    CHECK (estado IN ('iniciada', 'completada', 'fallida')),
  -- Una operación completada sin resultado ni fecha no permite responder al
  -- reintento con lo mismo que se devolvió la primera vez.
  CONSTRAINT operaciones_completada_tiene_resultado
    CHECK (estado <> 'completada' OR (resultado IS NOT NULL AND terminada_en IS NOT NULL))
);

CREATE INDEX operaciones_por_contacto ON operaciones (contacto_id);

-- ── Citas ────────────────────────────────────────────────────────────────────
-- El destinatario NO es una columna que venga del texto: es `contacto_id`, y lo
-- fija el sistema desde la conversación en curso. Ver src/core/acciones/.

CREATE TABLE citas (
  id            UUID        PRIMARY KEY,
  contacto_id   UUID        NOT NULL REFERENCES contactos(id) ON DELETE RESTRICT,
  clave_operacion TEXT      NOT NULL REFERENCES operaciones(clave) ON DELETE RESTRICT,
  motivo        TEXT        NOT NULL,
  inicia_en     TIMESTAMPTZ NOT NULL,
  termina_en    TIMESTAMPTZ NOT NULL,
  estado        TEXT        NOT NULL DEFAULT 'confirmada',
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT citas_estado_valido
    CHECK (estado IN ('confirmada', 'cancelada', 'cumplida')),
  CONSTRAINT citas_termina_despues_de_empezar
    CHECK (termina_en > inicia_en)
);

CREATE INDEX citas_por_contacto ON citas (contacto_id);
CREATE UNIQUE INDEX citas_una_por_operacion ON citas (clave_operacion);

-- ── Disponibilidad ───────────────────────────────────────────────────────────
-- Huecos que el sistema puede ofrecer. Se siembran fuera de este flujo; la
-- herramienta de consulta solo lee, y la de agendar los marca como tomados.

CREATE TABLE huecos (
  id         UUID        PRIMARY KEY,
  inicia_en  TIMESTAMPTZ NOT NULL,
  termina_en TIMESTAMPTZ NOT NULL,
  -- NULL mientras esté libre. Que sea el propio contacto y no un booleano evita
  -- el estado imposible «tomado por nadie».
  tomado_por UUID        REFERENCES contactos(id) ON DELETE SET NULL,

  CONSTRAINT huecos_termina_despues_de_empezar
    CHECK (termina_en > inicia_en)
);

CREATE INDEX huecos_libres ON huecos (inicia_en) WHERE tomado_por IS NULL;

-- ── Un prospecto por contacto ────────────────────────────────────────────────
-- La recolección progresiva necesita un único destino donde ir fusionando lo que
-- el cliente va contando. Sin esta restricción, dos llamadas concurrentes crean
-- dos prospectos y cada uno tiene la mitad de los datos — que es peor que no
-- tener ninguno, porque los dos parecen completos.

DELETE FROM prospectos a USING prospectos b
 WHERE a.contacto_id = b.contacto_id AND a.creado_en > b.creado_en;

CREATE UNIQUE INDEX prospectos_uno_por_contacto ON prospectos (contacto_id);
