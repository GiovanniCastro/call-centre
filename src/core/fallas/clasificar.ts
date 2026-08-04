// Clasificación de fallas **por significado, no por número**.
//
// Es la pieza que el plan pide primero, y la que decide si el informe de salud
// sirve para algo. Un informe que agrupa por código de estado produce filas como
// «17 × HTTP 500», que no dicen a quién llamar. Lo que hace falta saber es qué
// hay que hacer, y eso no es una función del número:
//
//   - **El mismo número significa cosas distintas.** `ECONNREFUSED` contra
//     `localhost:5432` es «no levantaste los servicios» y se arregla con
//     `npm run servicios`. El mismo `ECONNREFUSED` contra un proveedor de nube es
//     «el proveedor está caído» y no se arregla desde aquí: se espera o se
//     degrada a local. Idéntico errno, dos remedios opuestos. Por eso la
//     clasificación mira **a dónde iba** la llamada, no solo qué devolvió.
//   - **Números distintos significan lo mismo.** `401` y `403`, y el cuerpo que
//     dice «invalid x-api-key», son la misma falla: la credencial no vale.
//   - **Y números vecinos significan cosas opuestas.** `429` es «te has pasado
//     de tu cuota» —tuyo, se arregla bajando el ritmo o subiendo el plan—; `529`
//     es «el proveedor está saturado» —suyo, y bajar tu ritmo no lo arregla—.
//     Un informe que los meta en el mismo cajón de «errores 5xx / 4xx» manda a
//     quien lo lea a mirar donde no es.
//
// Nada de esto llama a un modelo. Invariante 7: los vigías son código
// determinista. Un clasificador que le preguntara a un modelo qué significa un
// error sería un modelo juzgando el trabajo de otro, y además fallaría
// justamente cuando el proveedor está caído — que es cuando hace falta.
//
// **`desconocida` es una clase de primera y tiene que verse.** La tentación es
// hacer que todo caiga en algún cajón plausible; el resultado es un informe que
// siempre parece saber lo que pasa. Lo que no se reconoce sale como no
// reconocido, con su recuento, y ese recuento es la lista de trabajo del
// clasificador.

/** Qué clase de problema es, en términos de qué hay que hacer con él. */
export const CLASES_DE_FALLA = [
  'credencial',
  'cuota',
  'proveedor_saturado',
  'proveedor_caido',
  'servicio_local_caido',
  'tiempo_agotado',
  'contrato_roto',
  'datos',
  'desconocida',
] as const;

export type ClaseDeFalla = (typeof CLASES_DE_FALLA)[number];

/**
 * Lo que un agente de código —o una persona— necesita para proponer una
 * corrección sin abrir la base de datos ni los registros crudos.
 *
 * Es el criterio de aceptación de la fase escrito como tipo. `que_hacer` y
 * `donde_mirar` no son adorno: sin ellos el informe describe el síntoma y deja
 * el diagnóstico de deberes.
 */
export type Remedio = {
  readonly que_significa: string;
  readonly que_hacer: string;
  /** Por dónde empezar a leer. Rutas del repositorio, no descripciones vagas. */
  readonly donde_mirar: readonly string[];
  /** Si arreglarlo está en nuestra mano o depende de un tercero. */
  readonly esta_en_nuestra_mano: boolean;
};

export const REMEDIOS: Readonly<Record<ClaseDeFalla, Remedio>> = {
  credencial: {
    que_significa:
      'La credencial no vale: caducó, se revocó o nunca fue la correcta. No es un ' +
      'problema de código; ningún reintento la va a arreglar.',
    que_hacer:
      'Comprobar el parte de secretos (`parteDeSecretos()`), renovar la credencial en ' +
      'el proveedor y reponerla en el entorno del servicio. Si caducó, es lo que la ' +
      'vigilancia de caducidad de credenciales de la fase 4C existe para adelantar.',
    donde_mirar: ['src/operacion/secretos.ts', 'src/core/credencial.ts'],
    esta_en_nuestra_mano: true,
  },
  cuota: {
    que_significa:
      'Se agotó el ritmo o el crédito contratado. El límite es nuestro, no del ' +
      'proveedor: bajarlo o ampliarlo está en nuestra mano.',
    que_hacer:
      'Contrastar con el vigía de presupuesto: si el techo interno no saltó y el ' +
      'externo sí, el techo interno está mal calibrado y hay que bajarlo. Mientras ' +
      'tanto, degradar a local es la salida correcta.',
    donde_mirar: ['config/vigias.json', 'src/core/vigias/presupuesto.ts'],
    esta_en_nuestra_mano: true,
  },
  proveedor_saturado: {
    que_significa:
      'El proveedor está sobrecargado y pide que se vuelva más tarde. No es nuestra ' +
      'cuota: bajar nuestro ritmo no lo arregla, solo lo espera.',
    que_hacer:
      'Reintentar con espera creciente, y si persiste, desviar a local. Es el caso ' +
      'que el respaldo controlado del enrutador existe para cubrir; si no se está ' +
      'desviando, el fallo está en el respaldo, no en el proveedor.',
    donde_mirar: ['src/core/enrutador/enrutar.ts', 'config/politica.json'],
    esta_en_nuestra_mano: false,
  },
  proveedor_caido: {
    que_significa:
      'El proveedor externo no responde o devuelve un error de su lado. Está fuera ' +
      'del perímetro y fuera de nuestro control.',
    que_hacer:
      'Comprobar el estado del servicio del proveedor antes de tocar nada del agente. ' +
      'El vigía de proveedor debería estar avisando ya; si no avisó, su ventana o su ' +
      'umbral están mal puestos y eso sí es trabajo nuestro.',
    donde_mirar: ['src/core/vigias/observan.ts', 'src/providers/inferencia/'],
    esta_en_nuestra_mano: false,
  },
  servicio_local_caido: {
    que_significa:
      'Una pieza del propio perímetro no está en pie: PostgreSQL, Redis, Qdrant u ' +
      'Ollama. El mismo error de conexión que en un proveedor, pero del lado de ' +
      'dentro — y por eso el remedio es el contrario.',
    que_hacer:
      'Levantar los servicios (`npm run servicios`) o arrancar Ollama. Si ya estaban ' +
      'en pie, mirar la URL configurada antes que el código: una URL mal puesta y un ' +
      'servicio caído se ven exactamente igual desde aquí.',
    donde_mirar: ['docker-compose.yml', '.env.ejemplo', 'src/repos/cliente.ts'],
    esta_en_nuestra_mano: true,
  },
  tiempo_agotado: {
    que_significa:
      'La operación no terminó dentro de su plazo. Puede ser lentitud del proveedor o ' +
      'un plazo demasiado corto para el modelo que se está usando.',
    que_hacer:
      'Contrastar la latencia observada con el plazo configurado antes de subirlo: si ' +
      'el modelo local tarda de media más que el plazo, el plazo está mal, no el ' +
      'modelo. Subirlo a ciegas convierte un fallo rápido en un caso colgado.',
    donde_mirar: ['config/politica.json', 'src/core/vigias/bucle.ts'],
    esta_en_nuestra_mano: true,
  },
  contrato_roto: {
    que_significa:
      'El modelo respondió, pero no en la forma pactada: JSON no analizable, esquema ' +
      'inválido o citas que no verifican. El sistema funcionó; lo que falló es lo que ' +
      'el modelo puso dentro.',
    que_hacer:
      'NO se arregla aflojando el verificador — esa es la medición, no el defecto. Se ' +
      'arregla con el modelo, con las instrucciones o con el esquema. Es el hallazgo ' +
      'principal de la fase 7 con gemma4, y sigue siendo la falla más frecuente.',
    donde_mirar: [
      'src/core/respuesta/responder.ts',
      'src/core/respuesta/esquemas.ts',
      'config/modelos-locales.json',
    ],
    esta_en_nuestra_mano: true,
  },
  datos: {
    que_significa:
      'La base de datos rechazó la operación: una restricción, una clave duplicada o ' +
      'una migración que falta. El dato que llegó no es el que el esquema admite.',
    que_hacer:
      'Leer la restricción que saltó: en este proyecto los invariantes están escritos ' +
      'como `CHECK`, así que una violación suele ser un invariante defendiéndose, no ' +
      'un esquema equivocado. Comprobar antes que las migraciones estén aplicadas.',
    donde_mirar: ['migrations/', 'src/repos/'],
    esta_en_nuestra_mano: true,
  },
  desconocida: {
    que_significa:
      'El clasificador no reconoce esta falla. No es que no importe: es que todavía ' +
      'no se sabe qué es, y decirlo es más útil que colocarla en el cajón que más se ' +
      'le parezca.',
    que_hacer:
      'Leer la plantilla del mensaje y, si la falla se repite, añadirle una regla al ' +
      'clasificador. El recuento de esta clase es la lista de trabajo del propio ' +
      'clasificador; que baje con el tiempo es la señal de que está aprendiendo.',
    donde_mirar: ['src/core/fallas/clasificar.ts'],
    esta_en_nuestra_mano: true,
  },
};

/**
 * Lo que se sabe de una falla en el momento de clasificarla.
 *
 * `destino` es el campo que hace posible distinguir dentro de fuera, y por eso
 * no es opcional por comodidad: sin él, un fallo de conexión es ambiguo y el
 * clasificador lo dice en lugar de adivinar.
 */
export type ObservacionDeFalla = {
  /** Qué se estaba haciendo. Ej. `inferencia.nube`, `recuperacion`, `repos.eventos`. */
  readonly operacion: string;
  readonly mensaje: string;
  /** Código HTTP, si lo hubo. */
  readonly codigo?: number | null;
  /** Nombre de la excepción: `AbortError`, `TypeError`, `ZodError`… */
  readonly nombre?: string | null;
  /** A dónde iba la llamada. `null` si no salió a ninguna parte. */
  readonly destino?: string | null;
};

export type Clasificacion = {
  readonly clase: ClaseDeFalla;
  /** Qué señal concreta decidió la clase. Permite auditar el criterio. */
  readonly por_que: string;
};

/**
 * Anfitriones del propio perímetro.
 *
 * La lista no incluye puertos a propósito: un Qdrant en otro puerto sigue siendo
 * un servicio de dentro. Lo que distingue no es el número, es de qué lado del
 * perímetro está la máquina.
 */
const ANFITRIONES_DE_DENTRO = /(localhost|127\.0\.0\.1|::1|\bhost\.docker\.internal\b|\bpostgres\b|\bredis\b|\bqdrant\b|\bollama\b)/i;

/** Errores de red que significan «no hay nadie escuchando ahí». */
const SIN_NADIE_ESCUCHANDO = /\b(ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ECONNRESET|EPIPE)\b/;

function esDeDentro(observacion: ObservacionDeFalla): boolean {
  const donde = `${observacion.destino ?? ''} ${observacion.mensaje}`;
  return ANFITRIONES_DE_DENTRO.test(donde);
}

/**
 * Clasifica una falla.
 *
 * El orden de las reglas **es** la clasificación: las señales inequívocas van
 * primero, y las que dependen de interpretar un texto, al final. Cambiar el
 * orden cambia el resultado, así que cada bloque dice por qué está donde está.
 */
export function clasificar(observacion: ObservacionDeFalla): Clasificacion {
  const mensaje = observacion.mensaje;
  const codigo = observacion.codigo ?? null;
  const nombre = observacion.nombre ?? '';

  // 1. La credencial, primero. Un 401 es la falla menos ambigua que existe, y
  //    además es la única cuyo remedio no está en el código: si se clasificara
  //    después, un mensaje que además mencione «timeout» la taparía.
  if (codigo === 401 || codigo === 403) {
    return { clase: 'credencial', por_que: `el proveedor respondió ${codigo}` };
  }
  if (/\b(invalid|missing|expired|revoked)[^.]{0,20}\b(api[- _]?key|token|credential)/i.test(mensaje)) {
    return { clase: 'credencial', por_que: 'el mensaje declara una credencial inválida o caducada' };
  }
  if (/\bauthentication_error\b|\bunauthorized\b|\bpermission_denied\b/i.test(mensaje)) {
    return { clase: 'credencial', por_que: 'el proveedor nombró un error de autenticación' };
  }

  // 2. Cuota y saturación, separadas. Son las dos que más se confunden y las que
  //    más caro cuesta confundir: una se arregla bajando el ritmo y la otra no
  //    se arregla desde aquí.
  if (codigo === 429 || /\brate[ _]?limit|\bquota\b|\btoo many requests\b/i.test(mensaje)) {
    return { clase: 'cuota', por_que: codigo === 429 ? 'HTTP 429' : 'el mensaje nombra cuota o límite de ritmo' };
  }
  if (codigo === 529 || /\boverloaded\b|\bcapacity\b|\bserver is busy\b/i.test(mensaje)) {
    return {
      clase: 'proveedor_saturado',
      por_que: codigo === 529 ? 'HTTP 529, que es saturación del proveedor y no cuota nuestra' : 'el proveedor declaró saturación',
    };
  }

  // 3. Tiempo agotado antes que conexión: un `AbortError` suele traer también un
  //    mensaje de red, y lo que importa es que fuimos nosotros quienes cortamos.
  if (nombre === 'AbortError' || nombre === 'TimeoutError') {
    return { clase: 'tiempo_agotado', por_que: `la excepción se llama ${nombre}` };
  }
  if (/\b(ETIMEDOUT|ESOCKETTIMEDOUT)\b|\btimed? ?out\b|\btiempo (máximo|agotado)\b/i.test(mensaje)) {
    return { clase: 'tiempo_agotado', por_que: 'el mensaje declara un plazo agotado' };
  }

  // 4. Conexión. Aquí es donde se decide mirando A DÓNDE iba, que es el motivo
  //    de que `destino` exista. El mismo errno, dos clases y dos remedios.
  if (SIN_NADIE_ESCUCHANDO.test(mensaje) || /\bconnect(ion)? (refused|reset|error)\b/i.test(mensaje)) {
    return esDeDentro(observacion)
      ? {
          clase: 'servicio_local_caido',
          por_que: 'no hay nadie escuchando, y el destino está DENTRO del perímetro',
        }
      : {
          clase: 'proveedor_caido',
          por_que: 'no hay nadie escuchando, y el destino está FUERA del perímetro',
        };
  }

  // 5. El resto de los 5xx del proveedor. Después de 529 a propósito: si fuera
  //    antes, la saturación quedaría enterrada en «el proveedor falló».
  if (codigo !== null && codigo >= 500) {
    return { clase: 'proveedor_caido', por_que: `el proveedor respondió ${codigo}` };
  }

  // 6. Contrato roto. El sistema funcionó; lo que no cumplió fue el contenido.
  //
  // El sustento insuficiente entra aquí, y merece decirse: el verificador hizo
  // su trabajo —bloqueó una respuesta sin procedencia comprobable—, así que la
  // falla no es suya. Es del modelo, que respondió sin citar lo que se le dio.
  // Es el hallazgo central de la fase 7 con gemma4, y la clase lo nombra en vez
  // de disolverlo en «el agente escaló».
  if (
    /\bJSON\b[^.]{0,30}\b(analizable|parse|inválid|invalid)|\bunexpected token\b/i.test(mensaje) ||
    /\besquema (inválido|invalido)\b|\bschema (validation|invalid)\b/i.test(mensaje) ||
    /\bsustento\b|\bprocedencia (no |sin )?verific/i.test(mensaje) ||
    nombre === 'ZodError' ||
    nombre === 'SyntaxError'
  ) {
    return { clase: 'contrato_roto', por_que: 'la salida del modelo no cumple la forma pactada' };
  }

  // 7. Fallas de dentro, nombradas por el propio perímetro.
  //
  // Estas no vienen de un proveedor sino de nuestros propios frenos, y sus
  // mensajes son fijos porque los escribimos nosotros. Clasificarlas es barato y
  // no hacerlo saldría caro: irían todas a `desconocida`, que es la clase que
  // mide lo que el clasificador no sabe, y quedaría midiendo lo que sí sabe.
  if (/\bno hay adaptador para el plano\b/i.test(mensaje)) {
    return {
      clase: 'credencial',
      por_que: 'el plano está declarado y sin configurar: le falta su credencial',
    };
  }
  if (/\btecho de presupuesto\b|\bpresupuesto alcanzado\b/i.test(mensaje)) {
    return { clase: 'cuota', por_que: 'un techo de presupuesto NUESTRO cortó el caso' };
  }
  if (/\bvig[ií]a de bucle\b|\bl[ií]mite de (pasos|herramientas|reintentos)\b/i.test(mensaje)) {
    return { clase: 'tiempo_agotado', por_que: 'el vigía de bucle cortó el caso por límite' };
  }

  // 8. Base de datos. Los códigos de PostgreSQL son de cinco caracteres y su
  //    clase —los dos primeros— basta: `23` es violación de integridad, `42`
  //    error de sintaxis o de objeto que no existe.
  if (/\b(23\d{3}|42\d{2}[0-9A-Z])\b/.test(mensaje) || /\b(constraint|duplicate key|relation .* does not exist)\b/i.test(mensaje)) {
    return { clase: 'datos', por_que: 'PostgreSQL rechazó la operación' };
  }

  return {
    clase: 'desconocida',
    por_que: 'ninguna regla del clasificador reconoció esta falla',
  };
}
