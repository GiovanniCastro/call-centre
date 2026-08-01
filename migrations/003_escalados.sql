-- Perímetro · migración 003 — la cola de escalado a un humano.
--
-- Criterio de aceptación de la fase 4: **el caso escalado conserva el hilo
-- completo**. Por eso `transcripcion` es JSONB y no un resumen: un operador que
-- recibe «el cliente pregunta por su póliza» y tiene que reconstruir el resto no
-- está recibiendo un escalado, está recibiendo un aviso.
--
-- Lleva `contacto_id` como todas las tablas de datos, y `src/repos/escalados.ts`
-- exige `AlcanceContacto` en todas sus funciones: un operador no puede ver por
-- accidente la cola de otro cliente.

CREATE TABLE escalados (
  id             UUID        PRIMARY KEY,
  contacto_id    UUID        NOT NULL REFERENCES contactos(id) ON DELETE RESTRICT,
  conversacion_id UUID       REFERENCES conversaciones(id) ON DELETE SET NULL,
  caso_id        TEXT        NOT NULL,

  -- Por qué salió del automático. Nunca es NULL: un escalado sin motivo obliga
  -- al operador a adivinar qué se esperaba de él.
  motivo         TEXT        NOT NULL,
  -- Qué clase de fallo. Sirve para contar por tipo sin analizar el texto.
  clase          TEXT        NOT NULL,

  -- El hilo entero, tal como lo vio el agente.
  transcripcion  JSONB       NOT NULL,
  -- Los fragmentos que se recuperaron, con su puntuación. El operador tiene que
  -- poder ver lo mismo que vio el agente para juzgar si el escalado fue correcto.
  fuentes        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- Lo que el modelo propuso y el verificador rechazó, campo a campo.
  rechazados     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  sustento       REAL,

  estado         TEXT        NOT NULL DEFAULT 'pendiente',
  operador       TEXT,
  resuelto_en    TIMESTAMPTZ,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT escalados_clase_valida
    CHECK (clase IN ('sin_sustento', 'esquema_invalido', 'modelo_no_puede',
                     'sin_fuentes', 'peticion_sensible', 'fallo_de_ejecucion')),
  CONSTRAINT escalados_estado_valido
    CHECK (estado IN ('pendiente', 'en_curso', 'resuelto', 'descartado')),
  -- Un escalado resuelto sin operador ni fecha es un estado que nadie puede
  -- auditar: quién lo atendió y cuándo son parte de la resolución.
  CONSTRAINT escalados_resuelto_tiene_quien_y_cuando
    CHECK (estado <> 'resuelto' OR (operador IS NOT NULL AND resuelto_en IS NOT NULL))
);

CREATE INDEX escalados_por_contacto ON escalados (contacto_id);
CREATE INDEX escalados_pendientes ON escalados (creado_en) WHERE estado = 'pendiente';
