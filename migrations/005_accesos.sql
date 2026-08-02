-- Fase 6 · Registro de acceso al panel, **incluido el de lectura**.
--
-- Registrar solo las escrituras es lo habitual y aquí no sirve de nada: el panel
-- no tiene escrituras. Todo lo que puede pasar en él es que alguien mire, y si
-- mirar no deja rastro, el registro de accesos está vacío por construcción y no
-- responde la única pregunta que importa —quién vio la conversación de quién.

CREATE TABLE accesos_panel (
  id                UUID        PRIMARY KEY,
  momento           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Quién. El identificador de Firebase Auth, no un nombre: un nombre cambia y
  -- el registro dejaría de poder responder por accesos antiguos.
  operador          TEXT        NOT NULL,
  rol               TEXT        NOT NULL,

  -- Qué miró. `recurso` es la ruta de la proyección: `agregados/...` o
  -- `trazas/...`. La distinción entre los dos es la que da sentido al registro.
  accion            TEXT        NOT NULL,
  recurso           TEXT        NOT NULL,

  -- Si se concedió. Los intentos denegados se registran igual, y son los más
  -- interesantes: un rol de métricas pidiendo trazas repetidamente es una señal.
  concedido         BOOLEAN     NOT NULL,
  motivo_denegacion TEXT,

  origen            TEXT,

  CONSTRAINT accesos_rol_valido
    CHECK (rol IN ('metricas', 'trazas')),

  CONSTRAINT accesos_accion_valida
    CHECK (accion IN ('leer_agregados', 'leer_traza', 'leer_vigias', 'listar_trazas')),

  -- Una denegación sin motivo no se puede auditar; una concesión con motivo de
  -- denegación es una contradicción.
  CONSTRAINT accesos_motivo_coherente
    CHECK (concedido = (motivo_denegacion IS NULL))
);

-- Por operador y por recurso: las dos preguntas que se le hacen a este registro
-- son «qué miró esta persona» y «quién miró esta conversación».
CREATE INDEX accesos_por_operador ON accesos_panel (operador, momento DESC);
CREATE INDEX accesos_por_recurso  ON accesos_panel (recurso, momento DESC);
