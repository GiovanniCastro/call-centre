// El verificador de procedencia. Tres comprobaciones, todas deterministas.
//
//   1. El `fragmento_id` existe.
//   2. Ese fragmento se recuperó **en esta ejecución**.
//   3. El valor citado aparece **literalmente** en ese fragmento.
//
// Ninguna llama a un modelo, y esa es la propiedad que hace que esto exista. La
// regla 7 del preámbulo prohíbe un modelo juzgando a otro; un verificador que
// «entienda» si una afirmación está respaldada sería exactamente eso.
//
// **La segunda comprobación es la que atrapa la alucinación de cita**, que es el
// fallo más peligroso de un sistema con recuperación: el modelo inventa un
// identificador con forma correcta y lo cuelga de una afirmación falsa. Sin la
// comprobación de «se recuperó aquí», un identificador que existe en el índice
// pero que nadie trajo a esta ejecución pasaría como legítimo.
//
// La tercera es literal a propósito. Aceptar paráfrasis obligaría a decidir
// cuánto puede alejarse una paráfrasis de su original, y esa decisión no tiene
// respuesta objetiva. Copiar o no afirmar es incómodo para el modelo y es lo que
// hace que el resultado se pueda defender.

import type { FragmentoRecuperado } from '../conocimiento/documento.ts';
import type { CampoConProcedencia, SalidaEstructurada } from './esquemas.ts';

export type MotivoDeRechazo =
  | 'fragmento_inexistente'
  | 'fragmento_no_recuperado_aqui'
  | 'valor_no_literal';

export type CampoVerificado = {
  readonly campo: CampoConProcedencia;
  readonly valido: boolean;
  readonly motivo: MotivoDeRechazo | null;
  readonly explicacion: string | null;
};

export type Veredicto = {
  readonly campos: readonly CampoVerificado[];
  /** Proporción contable, no estimación: válidos sobre totales. */
  readonly sustento: { readonly campos_totales: number; readonly campos_con_procedencia: number };
  /** Los `fragmento_id` que sobrevivieron. Es lo que va al campo `fuentes`. */
  readonly fuentes: readonly string[];
};

/**
 * Normaliza para comparar: espacios colapsados y mayúsculas fuera.
 *
 * Es la única tolerancia que se concede, y no es paráfrasis: el modelo copia el
 * valor de un fragmento que puede traer saltos de línea o doble espacio del
 * Markdown original. Rechazar «$5 al mes» porque el fragmento dice «$5  al mes»
 * sería rechazar por una diferencia que no cambia lo afirmado.
 */
function normalizar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function verificar(
  salida: SalidaEstructurada,
  recuperados: readonly FragmentoRecuperado[],
): Veredicto {
  const porId = new Map(recuperados.map((f) => [f.fragmento_id, f]));

  const campos = salida.datos.map((campo): CampoVerificado => {
    const fragmento = porId.get(campo.fragmento_id);

    // Comprobaciones 1 y 2 a la vez: el mapa solo tiene lo recuperado AQUÍ, así
    // que un identificador que no está o bien no existe, o bien existe en el
    // índice y nadie lo trajo. Las dos son motivo de rechazo, y se distinguen en
    // el mensaje para que el registro sirva de algo.
    if (fragmento === undefined) {
      return {
        campo,
        valido: false,
        motivo: 'fragmento_no_recuperado_aqui',
        explicacion:
          `el fragmento «${campo.fragmento_id}» no se recuperó en esta ejecución. ` +
          'O el modelo lo inventó, o citó algo que nadie trajo: en los dos casos la ' +
          'afirmación no está sustentada por lo que el agente tenía delante.',
      };
    }

    // Comprobación 3.
    if (!normalizar(fragmento.texto).includes(normalizar(campo.valor))) {
      return {
        campo,
        valido: false,
        motivo: 'valor_no_literal',
        explicacion:
          `el valor «${campo.valor}» no aparece literalmente en el fragmento ` +
          `«${campo.fragmento_id}». El modelo lo parafraseó, lo dedujo o lo inventó; ` +
          'ninguna de las tres es citar.',
      };
    }

    return { campo, valido: true, motivo: null, explicacion: null };
  });

  const validos = campos.filter((c) => c.valido);

  return {
    campos,
    sustento: { campos_totales: campos.length, campos_con_procedencia: validos.length },
    fuentes: [...new Set(validos.map((c) => c.campo.fragmento_id))],
  };
}

/** Proporción de sustento, con el denominador cero resuelto de forma explícita. */
export function proporcionDeSustento(veredicto: Veredicto): number {
  const { campos_totales, campos_con_procedencia } = veredicto.sustento;
  // Sin campos factuales no hay nada que sustentar: un saludo tiene sustento
  // pleno por vacuidad. Devolver 0 lo trataría como el peor caso posible y
  // hundiría cualquier promedio que lo incluyera.
  return campos_totales === 0 ? 1 : campos_con_procedencia / campos_totales;
}
