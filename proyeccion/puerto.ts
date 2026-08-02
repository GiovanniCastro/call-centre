// El destino de la proyección, como puerto.
//
// **Invariante 8: la proyección es de un solo sentido.** Este puerto solo sabe
// escribir. No tiene `leer`, y esa ausencia es la mitad del invariante escrita en
// el tipo: un publicador que no puede leer de Firestore no puede, ni por
// descuido ni por un cambio futuro, traer al perímetro algo que venga de fuera.
//
// La otra mitad la ponen las reglas de Firestore, que impiden escribir a
// cualquiera que no sea el Admin SDK. Las dos hacen falta: el tipo protege del
// error propio, las reglas del ajeno.
//
// Que sea un puerto y no el SDK directamente tiene además una consecuencia
// práctica inmediata: la fase 6 se puede construir y probar entera sin
// credenciales de Firebase, con el adaptador de archivos. El de Firestore es
// cien líneas que se enchufan el día que existan.

/** Un documento de la proyección: la ruta donde va y lo que lleva. */
export type DocumentoProyectado = {
  /** `agregados/2026-08` o `trazas/lote:v1:001`. */
  readonly ruta: string;
  readonly contenido: Record<string, unknown>;
};

export interface DestinoDeProyeccion {
  /** Cómo se identifica en el registro de publicaciones. */
  readonly nombre: string;

  /**
   * Escribe un lote de documentos. Todo o nada.
   *
   * Atómico porque el panel lee cifras que se refieren unas a otras: publicar
   * los agregados y no el estado de vigías dejaría una pantalla donde el reparto
   * dice una cosa y el vigía otra, y quien la mire no tiene forma de saber que
   * está viendo dos instantes distintos.
   */
  publicar(documentos: readonly DocumentoProyectado[]): Promise<void>;
}
