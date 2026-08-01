// Adaptador del canal `lote`. Segundo canal del sistema (fase 3B).
//
// Existe para convertir en prueba el criterio de aceptación de la fase 1 —«el
// núcleo no importa nada específico del canal»—, que hasta ahora solo se
// verificaba leyendo código y con el check de arquitectura. La única
// verificación real es un segundo canal, y este no depende de nadie: ni número
// corporativo, ni revisión de Meta, ni token de terceros.
//
// **`verificarCredencial` rechaza SIEMPRE, y ese es su contenido.** El lote se
// alimenta desde archivos que ya están dentro del perímetro; no hay ningún
// llamante remoto al que autenticar. Devolver «válida» sin comprobar nada
// abriría un canal sin credencial el día que alguien lo enganchara al webhook —y
// el criterio «una petición sin credencial válida nunca llega a la cola» dejaría
// de ser cierto para uno de los canales sin que nadie lo notara. Rechazar por
// construcción es lo único que lo mantiene cierto para todos.

import type {
  Canal,
  DestinoRespuesta,
  PeticionEntrante,
  Requisito,
  ResultadoVerificacion,
} from '../../core/canal.ts';
import type { MensajeCanonico } from '../../core/mensaje.ts';
import { normalizarCaso } from './normalizar.ts';

/**
 * El lote no lleva credenciales, y la lista vacía lo dice.
 *
 * No es un descuido: `evaluarRequisitos` con cero requisitos no encuentra nada
 * que falte, así que el canal queda `configurado` siempre. Es lo correcto — un
 * canal que lee archivos locales no puede estar «sin configurar».
 */
export const REQUISITOS_LOTE: readonly Requisito[] = [] as const;

/** Lo que el lote responde. En vez de a una red, va a un recolector en memoria. */
export type RespuestaDeLote = {
  readonly identificador_externo: string;
  readonly texto: string;
  readonly momento: string;
};

export type CanalDeLote = Canal & {
  /** Todo lo respondido durante esta ejecución, en orden. */
  respuestas(): readonly RespuestaDeLote[];
  limpiar(): void;
};

export function crearCanalLote(): CanalDeLote {
  const recogidas: RespuestaDeLote[] = [];

  return {
    nombre: 'lote',

    verificarCredencial(_peticion: PeticionEntrante): ResultadoVerificacion {
      return {
        valida: false,
        motivo:
          'el canal «lote» no acepta entregas de red: se alimenta desde archivos que ya ' +
          'están dentro del perímetro. Si esto se ve en un registro, alguien ha apuntado ' +
          'un webhook a un canal que no lo tiene.',
      };
    },

    normalizar(cuerpo: unknown): readonly MensajeCanonico[] {
      return normalizarCaso(cuerpo);
    },

    async responder(destino: DestinoRespuesta, texto: string): Promise<void> {
      // No hay nadie a quien contestar: el interlocutor es un archivo. Se recoge
      // para que el corredor de la fase 7 pueda comparar lo respondido con lo
      // esperado sin abrir un socket ni consumir presupuesto.
      recogidas.push({
        identificador_externo: destino.identificador_externo,
        texto,
        momento: new Date().toISOString(),
      });
    },

    respuestas() {
      return [...recogidas];
    },

    limpiar() {
      recogidas.length = 0;
    },
  };
}
