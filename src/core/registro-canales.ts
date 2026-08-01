// El registro de canales.
//
// Un canal está o configurado o no configurado, y el registro **no deja
// confundirlos**: `obtener` lanza si el canal no está utilizable, en lugar de
// devolver algo con lo que se pueda intentar enviar. Un conector declarado no es
// un canal activo, y tratarlos igual haría que el panel contase casos de un canal
// que nunca recibió ninguno — inflando el denominador de todo lo que se divide
// por casos.
//
// Este archivo vive en `src/core/` y no conoce ningún canal concreto: solo la
// interfaz. Lo sostiene el check `nucleo-sin-canal-concreto`.

import { ErrorDeCanal, type Canal, type EstadoCanal, type NombreCanal } from './canal.ts';

export class RegistroDeCanales {
  private readonly porNombre = new Map<NombreCanal, EstadoCanal>();

  registrar(estado: EstadoCanal): void {
    if (this.porNombre.has(estado.nombre)) {
      throw new ErrorDeCanal(
        `El canal «${estado.nombre}» ya está registrado. Dos registros del mismo ` +
          'canal significan que un mensaje podría ir por cualquiera de los dos, y ' +
          'cuál de ellos dependería del orden de arranque.',
      );
    }
    this.porNombre.set(estado.nombre, estado);
  }

  /**
   * El canal, listo para usar.
   *
   * @throws {ErrorDeCanal} Si no está registrado, o si está declarado pero sin
   *   configurar. El error dice qué falta: es el mensaje que va a leer quien
   *   intente instalarlo.
   */
  obtener(nombre: NombreCanal): Canal {
    const estado = this.porNombre.get(nombre);

    if (estado === undefined) {
      throw new ErrorDeCanal(`El canal «${nombre}» no está registrado.`);
    }

    if (estado.estado === 'no_configurado') {
      throw new ErrorDeCanal(
        `El canal «${nombre}» está declarado pero no configurado. Faltan: ` +
          `${estado.faltan.join(', ')}. Ver \`describirRequisitos\` para saber cómo ` +
          'obtener cada uno.',
      );
    }

    return estado.canal;
  }

  estaConfigurado(nombre: NombreCanal): boolean {
    return this.porNombre.get(nombre)?.estado === 'configurado';
  }

  /** Todos los estados, para el arranque y para el panel de la fase 6. */
  listar(): readonly EstadoCanal[] {
    return [...this.porNombre.values()];
  }

  /** Solo los que pueden recibir y responder. */
  activos(): readonly NombreCanal[] {
    return this.listar()
      .filter((e) => e.estado === 'configurado')
      .map((e) => e.nombre);
  }
}

/**
 * Lo que hay que hacer para instalar un canal que está declarado y sin
 * configurar. Es lo que se imprime al arrancar y lo que leerá el panel.
 *
 * Se devuelve como texto y no se imprime aquí: el núcleo no decide dónde va a
 * verse esto.
 */
export function describirRequisitos(estado: EstadoCanal): string {
  if (estado.estado === 'configurado') {
    return `El canal «${estado.nombre}» está configurado y activo.`;
  }

  const lineas = [
    `El canal «${estado.nombre}» está declarado pero NO configurado.`,
    `Faltan ${estado.faltan.length} de ${estado.requisitos.length} requisitos.`,
    '',
  ];

  for (const requisito of estado.requisitos) {
    const marca = estado.faltan.includes(requisito.variable) ? '✗' : '✓';
    lineas.push(`  ${marca} ${requisito.variable}`);
    lineas.push(`      ${requisito.descripcion}`);
    lineas.push(`      Cómo obtenerlo: ${requisito.como_obtenerlo}`);
    lineas.push('');
  }

  return lineas.join('\n');
}

/**
 * Decide el estado de un canal a partir de las variables que necesita.
 *
 * Todo o nada: con un requisito ausente, el canal queda `no_configurado`. Un
 * conector a medias falla en el primer mensaje real, que es el peor momento
 * posible para descubrir que faltaba un token.
 */
export function evaluarRequisitos(
  nombre: NombreCanal,
  requisitos: readonly { variable: string; descripcion: string; como_obtenerlo: string }[],
  entorno: Readonly<Record<string, string | undefined>>,
  construir: (valores: Readonly<Record<string, string>>) => Canal,
): EstadoCanal {
  const valores: Record<string, string> = {};
  const faltan: string[] = [];

  for (const requisito of requisitos) {
    const valor = entorno[requisito.variable];
    if (valor === undefined || valor.trim() === '') {
      faltan.push(requisito.variable);
    } else {
      valores[requisito.variable] = valor;
    }
  }

  if (faltan.length > 0) {
    return { estado: 'no_configurado', nombre, requisitos, faltan };
  }

  return { estado: 'configurado', nombre, canal: construir(valores) };
}
