-- Fase 6 · Actuaciones de los vigías e incidentes de seguridad.
--
-- Hasta ahora vivían en memoria, y estaba escrito por qué: «la persistencia
-- llega con el panel; hasta que haya quien las lea, guardarlas sería escribir
-- una tabla que nadie consulta». Ya hay quien las lea.
--
-- Dos tablas y no una, porque son dos cosas distintas por más que se parezcan.
-- Una actuación es un límite que se cruzó: tiene umbral y valor observado, y la
-- pregunta que se le hace es «¿está el sistema cerca de un techo?». Un incidente
-- es un intento de alguien: no tiene umbral, tiene autor, y la pregunta es «¿qué
-- está pasando con este contacto?». Meterlas en una tabla obligaría a dejar la
-- mitad de las columnas nulas en cada fila y a distinguirlas por un `tipo`, que
-- es la forma de que dentro de un año nadie sepa cuál es cuál.

CREATE TABLE actuaciones_vigia (
  id                UUID        PRIMARY KEY,
  momento           TIMESTAMPTZ NOT NULL,
  vigia             TEXT        NOT NULL,
  autoridad         TEXT        NOT NULL,
  umbral            NUMERIC(14,4) NOT NULL,
  valor_observado   NUMERIC(14,4) NOT NULL,
  explicacion       TEXT        NOT NULL,

  -- Contexto sin contenido del cliente. El tipo `Actuacion` lo dice —«nunca
  -- contenido del cliente»— y aquí no hay forma de imponerlo con un CHECK, así
  -- que lo impone el publicador: todo lo que sale pasa por el saneo.
  contexto          JSONB       NOT NULL DEFAULT '{}'::jsonb,

  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT actuaciones_autoridad_valida
    CHECK (autoridad IN ('avisar', 'degradar', 'detener')),

  -- Una actuación es un límite CRUZADO. Registrar una donde el valor no alcanza
  -- el umbral significaría que el vigía disparó sin motivo, y el panel enseñaría
  -- una alarma que no lo es.
  CONSTRAINT actuaciones_valor_cruza_umbral
    CHECK (valor_observado >= umbral)
);

CREATE INDEX actuaciones_por_vigia ON actuaciones_vigia (vigia, momento DESC);

-- Los incidentes NO se agrupan. Uno a uno, íntegros. Agrupar por huella es lo
-- que hace un informe de errores; aquí cada intento es una observación sobre un
-- contacto concreto, y contar «37 intentos de secuestro» sin poder abrir cuáles
-- convierte una señal de seguridad en una estadística.
CREATE TABLE incidentes_seguridad (
  id                UUID        PRIMARY KEY,
  momento           TIMESTAMPTZ NOT NULL,
  contacto_id       UUID        REFERENCES contactos(id) ON DELETE SET NULL,
  clase             TEXT        NOT NULL,
  nivel             TEXT        NOT NULL,

  -- El fragmento que disparó el detector, y el patrón que casó. El fragmento es
  -- texto del cliente: sale del perímetro solo saneado, como todo lo demás.
  fragmento         TEXT        NOT NULL,
  patron            TEXT        NOT NULL,

  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT incidentes_clase_valida
    CHECK (clase IN ('secuestro', 'envenenamiento', 'fuga', 'aislamiento')),
  CONSTRAINT incidentes_nivel_valido
    CHECK (nivel IN ('observar', 'limitar', 'cuarentena', 'detener_canal'))
);

CREATE INDEX incidentes_por_contacto ON incidentes_seguridad (contacto_id, momento DESC);
CREATE INDEX incidentes_por_clase    ON incidentes_seguridad (clase, momento DESC);
