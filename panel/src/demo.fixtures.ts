// **Datos de demostración. El único sitio del repositorio donde vive una cifra
// que no salió de una ejecución registrada.**
//
// Existe por una razón concreta: enseñar el panel a alguien sin levantar el
// perímetro. Y existe con una condición: que sea imposible enseñarlo sin decir
// que es una demostración.
//
// Esa condición la impone el tipo, no un acuerdo. La única función exportada
// devuelve una `Fuente` con `es_demostracion: true` y su `aviso`, y el panel
// recibe la fuente entera. No hay forma de extraer las cifras dejando la bandera
// atrás, porque no hay una función que devuelva solo las cifras.
//
// El lint prohíbe importar este archivo desde cualquier sitio que no sea el
// arranque del panel. Ver `eslint.config.js`.

import type { Fuente } from './fuente.ts';

/**
 * Cifras de demostración.
 *
 * Están **inspiradas** en la corrida real del lote de la fase 7 —51 % de
 * acierto, 12 de 12 retenidos, costo provisional— para que la pantalla se parezca
 * a lo que se verá de verdad. Pero no son esa corrida: los redondeos son de
 * conveniencia y el reparto local/nube es inventado, porque el modo nube nunca se
 * ha corrido. Por eso la banda dice «demostración» y no «ejemplo real».
 */
export function fuenteDeDemostracion(): Fuente {
  return {
    es_demostracion: true,
    origen: 'panel/src/demo.fixtures.ts',
    aviso:
      'DATOS DE DEMOSTRACIÓN. Ninguna de estas cifras sale de una ejecución ' +
      'registrada: están inspiradas en el lote de la fase 7 para que la pantalla ' +
      'se parezca a la real, pero el reparto local/nube es inventado porque el ' +
      'modo nube nunca se ha ejecutado.',
    proyeccion: {
      generado_en: '2026-08-02T10:00:00.000Z',
      ventana: { desde: '2026-07-03T00:00:00.000Z', hasta: '2026-08-02T00:00:00.000Z' },
      kpi: {
        casos: 65,
        resueltos: 18,
        escalados_a_humano: 44,
        bloqueados: 2,
        descartados: 1,
        resueltos_sin_intervencion: 18 / 65,
        costo_por_resuelto: null,
      },
      reparto: {
        por_destino: [
          {
            destino_ejecucion: 'local',
            casos: 52,
            costo: '0',
            costo_provisional: true,
            latencia_media_ms: '13148',
            tokens_entrada: 210_000,
            tokens_salida: 41_000,
          },
          {
            destino_ejecucion: 'nube',
            casos: 13,
            costo: '0',
            costo_provisional: true,
            latencia_media_ms: '2100',
            tokens_entrada: 48_000,
            tokens_salida: 9_400,
          },
        ],
        // El MISMO número que el KPI. Ni siquiera en los datos de demostración se
        // permite que las dos cifras diverjan: una demo que se contradice enseña
        // el defecto que el panel existe para no tener.
        escalados_a_humano: 44,
        costo_total: 0,
      },
      perimetro: [
        {
          clase_sensibilidad: 'alta',
          casos: 12,
          con_egreso: 0,
          retenidos: 12,
          como_texto: '12 de 12 retenidos',
        },
        {
          clase_sensibilidad: 'baja',
          casos: 53,
          con_egreso: 13,
          retenidos: 40,
          como_texto: '40 de 53 retenidos',
        },
      ],
      escalados_por_motivo: [
        { motivo_escalado: 'sustento por debajo del umbral de matiz', casos: 29 },
        { motivo_escalado: 'la recuperación no devolvió ningún fragmento', casos: 9 },
        { motivo_escalado: 'el modelo no devolvió JSON analizable', casos: 6 },
      ],
      sustento: { totales: 148, con_procedencia: 96, proporcion: 96 / 148 },
      latencia: { casos: 65, mediana_ms: '11000', p95_ms: '37000' },
      costeo: {
        provisional: true,
        supuestos: {
          equipo: 'SIN DEFINIR',
          estado: 'PROVISIONAL',
          vida_util_anios: 3,
          utilizacion_asumida: 0.4,
        },
      },
    },
  };
}
