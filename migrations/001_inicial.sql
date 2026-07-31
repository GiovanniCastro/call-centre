-- Perímetro · migración 001 — estado conversacional y telemetría.
--
-- Dos decisiones que se explican una vez y valen para todo el archivo:
--
-- 1. Los enums son TEXT con CHECK, no tipos ENUM nativos. Añadir un valor a un
--    ENUM de PostgreSQL es una migración con bloqueo; añadirlo a un CHECK es un
--    ALTER barato. El plan tiene diez fases por delante y estos conjuntos van a
--    crecer.
--
-- 2. Las restricciones estructurales del esquema de telemetría están repetidas
--    aquí como CHECK. No es duplicación por descuido: `src/telemetry/evento.ts`
--    protege lo que entra por el código, y esto protege lo que entra por
--    cualquier otra vía —una carga manual, una migración de datos, un script de
--    reparación—. La regla que solo vive en la capa de aplicación se salta con
--    un `psql`.
--
-- `contacto_id` está en todas las tablas de datos desde el primer día, aunque el
-- filtro de alcance de contacto llegue en la fase 1: una columna que se añade
-- después obliga a rellenar las filas existentes con algo, y ese algo siempre
-- acaba siendo un valor que no significa nada.

BEGIN;

CREATE TABLE esquema_migraciones (
  version      INTEGER     PRIMARY KEY,
  nombre       TEXT        NOT NULL,
  aplicada_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Contactos ────────────────────────────────────────────────────────────────
-- La persona al otro lado, identificada por canal. El mismo teléfono en
-- WhatsApp y en Telegram son dos contactos: no tenemos forma de probar que son
-- la misma persona, y unificarlos por suposición mezclaría las conversaciones
-- de dos clientes distintos.

CREATE TABLE contactos (
  id                    UUID        PRIMARY KEY,
  canal                 TEXT        NOT NULL,
  identificador_externo TEXT        NOT NULL,
  nombre_declarado      TEXT,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT contactos_canal_valido
    CHECK (canal IN ('whatsapp', 'telegram', 'voz', 'lote')),
  CONSTRAINT contactos_identidad_unica
    UNIQUE (canal, identificador_externo)
);

-- ── Conversaciones ───────────────────────────────────────────────────────────

CREATE TABLE conversaciones (
  id          UUID        PRIMARY KEY,
  contacto_id UUID        NOT NULL REFERENCES contactos(id) ON DELETE RESTRICT,
  canal       TEXT        NOT NULL,
  estado      TEXT        NOT NULL DEFAULT 'abierta',
  abierta_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrada_en  TIMESTAMPTZ,

  CONSTRAINT conversaciones_canal_valido
    CHECK (canal IN ('whatsapp', 'telegram', 'voz', 'lote')),
  CONSTRAINT conversaciones_estado_valido
    CHECK (estado IN ('abierta', 'escalada', 'cerrada')),
  -- Una conversación cerrada tiene fecha de cierre, y una abierta no la tiene.
  CONSTRAINT conversaciones_cierre_coherente
    CHECK ((estado = 'cerrada') = (cerrada_en IS NOT NULL))
);

CREATE INDEX conversaciones_por_contacto ON conversaciones (contacto_id, abierta_en DESC);

-- ── Mensajes ─────────────────────────────────────────────────────────────────
-- `id_externo` es el identificador que asigna el proveedor del canal. Su índice
-- único es lo que hace posible el rechazo de repetición de la fase 1: un mismo
-- mensaje reenviado por el proveedor no puede insertarse dos veces, aunque el
-- filtro de Redis falle.

CREATE TABLE mensajes (
  id              UUID        PRIMARY KEY,
  conversacion_id UUID        NOT NULL REFERENCES conversaciones(id) ON DELETE RESTRICT,
  contacto_id     UUID        NOT NULL REFERENCES contactos(id)      ON DELETE RESTRICT,
  direccion       TEXT        NOT NULL,
  tipo            TEXT        NOT NULL,
  contenido       TEXT        NOT NULL,
  -- De dónde vino el contenido. La fase 3 lo entrega al modelo como dato
  -- delimitado con su procedencia, nunca concatenado en las instrucciones.
  procedencia     TEXT        NOT NULL,
  adjuntos        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  id_externo      TEXT,
  marca_tiempo    TIMESTAMPTZ NOT NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT mensajes_direccion_valida
    CHECK (direccion IN ('entrante', 'saliente')),
  CONSTRAINT mensajes_tipo_valido
    CHECK (tipo IN ('texto', 'imagen', 'audio', 'documento', 'ubicacion', 'otro')),
  CONSTRAINT mensajes_procedencia_valida
    CHECK (procedencia IN ('cliente', 'agente', 'operador', 'sistema'))
);

CREATE UNIQUE INDEX mensajes_id_externo_unico
  ON mensajes (id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX mensajes_por_conversacion ON mensajes (conversacion_id, marca_tiempo);
CREATE INDEX mensajes_por_contacto     ON mensajes (contacto_id, marca_tiempo DESC);

-- ── Eventos de telemetría ────────────────────────────────────────────────────
-- Refleja `src/telemetry/evento.ts`. `resultado` y `desvio_ejecucion` son dos
-- columnas separadas a propósito (decisión R-002): son dos hechos distintos, y
-- meterlos en un solo campo produce dos cifras irreconciliables para lo mismo.

CREATE TABLE eventos (
  evento_id            UUID        PRIMARY KEY,
  version_esquema      INTEGER     NOT NULL DEFAULT 1,
  caso_id              TEXT        NOT NULL,
  conversacion_id      UUID        REFERENCES conversaciones(id) ON DELETE SET NULL,
  contacto_id          UUID        REFERENCES contactos(id)      ON DELETE SET NULL,
  marca_tiempo         TIMESTAMPTZ NOT NULL,
  canal                TEXT        NOT NULL,

  clase_tarea          TEXT        NOT NULL,
  clase_sensibilidad   TEXT        NOT NULL,

  destino_ejecucion    TEXT        NOT NULL,
  desvio_ejecucion     TEXT        NOT NULL DEFAULT 'ninguno',
  motivo_desvio        TEXT,

  resultado            TEXT        NOT NULL,
  motivo_escalado      TEXT,
  motivo_decision      TEXT        NOT NULL,

  hubo_egreso          BOOLEAN     NOT NULL,
  destinos_egreso      TEXT[]      NOT NULL DEFAULT '{}',

  fuentes              TEXT[]      NOT NULL DEFAULT '{}',
  sustento_totales     INTEGER,
  sustento_con_proc    INTEGER,

  latencia_ms          NUMERIC(12,2) NOT NULL,
  tokens_entrada       INTEGER     NOT NULL,
  tokens_salida        INTEGER     NOT NULL,
  modelo               TEXT,

  costo                NUMERIC(14,8) NOT NULL,
  costo_provisional    BOOLEAN     NOT NULL,
  precios_actualizados TEXT        NOT NULL,

  creado_en            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT eventos_canal_valido
    CHECK (canal IN ('whatsapp', 'telegram', 'voz', 'lote')),
  CONSTRAINT eventos_clase_tarea_valida
    CHECK (clase_tarea IN ('saludo', 'catalogo', 'extraccion', 'agendamiento', 'queja', 'ambiguo')),
  CONSTRAINT eventos_clase_sensibilidad_valida
    CHECK (clase_sensibilidad IN ('baja', 'media', 'alta')),
  CONSTRAINT eventos_destino_valido
    CHECK (destino_ejecucion IN ('local', 'nube')),
  CONSTRAINT eventos_desvio_valido
    CHECK (desvio_ejecucion IN ('ninguno', 'local_a_nube', 'nube_a_local')),
  CONSTRAINT eventos_resultado_valido
    CHECK (resultado IN ('resuelto', 'escalado_humano', 'descartado', 'bloqueado')),

  -- Todo desvío lleva su motivo, y sin desvío no hay motivo huérfano.
  CONSTRAINT eventos_motivo_desvio_coherente
    CHECK ((desvio_ejecucion <> 'ninguno') = (motivo_desvio IS NOT NULL)),

  -- Un caso que sale a un humano llega a la cola con su motivo.
  CONSTRAINT eventos_motivo_escalado_presente
    CHECK (resultado <> 'escalado_humano' OR motivo_escalado IS NOT NULL),

  -- Invariante 3: se registra qué salió y hacia dónde, o no salió nada.
  CONSTRAINT eventos_egreso_coherente
    CHECK (hubo_egreso = (cardinality(destinos_egreso) > 0)),

  -- Invariante 1: una tarea factual no se resuelve sin fuentes recuperadas.
  CONSTRAINT eventos_resuelto_con_fuente
    CHECK (
      clase_tarea NOT IN ('catalogo', 'extraccion', 'agendamiento')
      OR resultado <> 'resuelto'
      OR cardinality(fuentes) > 0
    ),

  -- El sustento es una proporción: o están sus dos partes, o no está ninguna.
  CONSTRAINT eventos_sustento_completo
    CHECK ((sustento_totales IS NULL) = (sustento_con_proc IS NULL)),
  CONSTRAINT eventos_sustento_es_proporcion
    CHECK (sustento_totales IS NULL OR sustento_con_proc <= sustento_totales),

  CONSTRAINT eventos_magnitudes_no_negativas
    CHECK (latencia_ms >= 0 AND tokens_entrada >= 0 AND tokens_salida >= 0 AND costo >= 0)
);

-- Invariante 5, en la base: un caso emite exactamente un evento. La unicidad
-- cubre la mitad «ni dos veces»; el arnés de `src/telemetry/arnes.ts` cubre la
-- mitad «ni cero», que ninguna restricción de base puede vigilar.
CREATE UNIQUE INDEX eventos_un_evento_por_caso ON eventos (caso_id);

CREATE INDEX eventos_por_tiempo        ON eventos (marca_tiempo DESC);
CREATE INDEX eventos_por_resultado     ON eventos (resultado, marca_tiempo DESC);
CREATE INDEX eventos_por_sensibilidad  ON eventos (clase_sensibilidad, hubo_egreso);
CREATE INDEX eventos_por_contacto      ON eventos (contacto_id, marca_tiempo DESC);

-- ── Prospectos ───────────────────────────────────────────────────────────────
-- Recolección progresiva: `campos` guarda lo capturado hasta ahora para que un
-- cliente que vuelve no tenga que repetir lo que ya dijo (criterio de la fase 5).

CREATE TABLE prospectos (
  id             UUID        PRIMARY KEY,
  contacto_id    UUID        NOT NULL REFERENCES contactos(id) ON DELETE RESTRICT,
  estado         TEXT        NOT NULL DEFAULT 'incompleto',
  campos         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Clave de idempotencia de la acción que lo creó (fase 5): ejecutar dos veces
  -- la misma acción no puede producir dos prospectos.
  clave_operacion TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT prospectos_estado_valido
    CHECK (estado IN ('incompleto', 'completo', 'convertido', 'descartado'))
);

CREATE UNIQUE INDEX prospectos_clave_operacion_unica
  ON prospectos (clave_operacion) WHERE clave_operacion IS NOT NULL;
CREATE INDEX prospectos_por_contacto ON prospectos (contacto_id);

INSERT INTO esquema_migraciones (version, nombre) VALUES (1, '001_inicial');

COMMIT;
