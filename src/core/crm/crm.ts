// La interfaz `CRM`. Tres métodos, y ni uno más.
//
// «No se construye un CRM: ni embudos, ni permisos, ni reportes, ni
// importadores.» Está en lo prohibido del manual, y la forma de cumplirlo no es
// la disciplina: es que la interfaz no tenga dónde meterlos. Tres métodos son
// pocos a propósito — con quince, añadir el dieciséis no cuesta nada y un día
// esto es un CRM a medias que hay que mantener.
//
// El adaptador por omisión es PostgreSQL, que ya está en el stack. Con eso, «el
// sistema funciona de principio a fin sin ninguna cuenta de CRM externa» es
// cierto por construcción y no por configuración.
//
// **Ninguno de los tres recibe destinatario.** Todos llevan `AlcanceContacto`,
// igual que las herramientas y por el mismo motivo.

import type { AlcanceContacto } from '../../repos/alcance.ts';

/** Lo que se sabe de alguien. Campo a campo, porque llega campo a campo. */
export type Prospecto = {
  readonly contacto_id: string;
  readonly campos: Readonly<Record<string, string>>;
  readonly estado: 'incompleto' | 'completo' | 'convertido' | 'descartado';
};

export type Hueco = {
  readonly id: string;
  readonly inicia_en: string;
  readonly termina_en: string;
};

export interface CRM {
  readonly nombre: string;

  /**
   * Crea o completa el prospecto de este contacto.
   *
   * **Fusiona, no reemplaza.** Es lo que hace cierto el criterio «si el agente
   * pierde el hilo y vuelve, los datos capturados no se vuelven a pedir»: cada
   * llamada añade lo nuevo y conserva lo viejo. Un `reemplazar` habría hecho que
   * una segunda llamada con un solo campo borrara los otros cinco, y el cliente
   * tendría que repetirlos — que es justo la experiencia que esto evita.
   */
  guardarProspecto(
    alcance: AlcanceContacto,
    campos: Readonly<Record<string, string>>,
  ): Promise<Prospecto>;

  obtenerProspecto(alcance: AlcanceContacto): Promise<Prospecto | null>;

  /** Huecos libres a partir de un momento. Solo lee. */
  huecosLibres(alcance: AlcanceContacto, desde: string, cuantos: number): Promise<readonly Hueco[]>;
}
