// El informe de salud, en dos formatos.
//
// Los dos formatos del plan no son dos informes: son **una estructura y una
// vista de ella**. `componer()` produce el objeto; `enMarkdown()` lo renderiza.
// El Markdown no vuelve a calcular nada, no filtra nada y no redondea por su
// cuenta — solo formatea lo que ya está decidido. Es la misma decisión que R-034
// tomó con el panel: dos superficies que cuentan lo mismo no se reconcilian con
// una prueba de que coinciden, se hacen imposibles de descuadrar derivándolas
// del mismo sitio.
//
// **El informe propone; nunca aplica.** Es el tercer criterio de aceptación de
// la fase, y aquí no es una promesa: este módulo no puede aplicar nada porque no
// alcanza nada que se pueda aplicar. No importa `src/repos/`, ni `src/salida/`,
// ni ningún adaptador, ni `src/core/acciones/`. Lo vigilan la regla
// `el-informe-propone-no-aplica` del grafo de dependencias y una prueba que
// recorre el árbol sintáctico buscando cualquier llamada con efecto. Sus
// entradas son datos y su salida es texto.
//
// **Y nada de lo que sale de aquí lleva datos de un cliente.** No porque se
// tenga cuidado al escribirlo, sino porque lo único que entra es lo que el vigía
// ya guardó, y el vigía guarda plantillas saneadas. La prueba del criterio
// —`tests/informe-salud.test.ts`— alimenta el ciclo con números de seguro
// social, tarjetas y teléfonos, y busca esas formas en el informe generado.

import { REMEDIOS, type Remedio } from './clasificar.ts';
import { SALUD, type ConfigSalud } from './config.ts';
import type { Encabezado, GrupoDeFallas } from './vigia.ts';

/** Un grupo con lo que hay que hacer con él ya resuelto. */
export type Hallazgo = GrupoDeFallas & {
  readonly remedio: Remedio;
};

export type InformeDeSalud = {
  readonly version: 1;
  readonly generado_en: string;
  /** De dónde salen las observaciones. Un informe sin procedencia no se audita. */
  readonly fuente: string;
  readonly encabezado: Encabezado;
  readonly hallazgos: readonly Hallazgo[];
  /**
   * Cuántos grupos no se enseñan por el tope de la configuración.
   *
   * Existe como campo y no como nota al pie porque un tope silencioso se lee
   * como «esto es todo», y un informe que parece completo sin serlo es peor que
   * uno que se declara parcial.
   */
  readonly grupos_omitidos: number;
  /**
   * Lo que este informe **no** cubre. Va dentro de la estructura, no en un
   * comentario, para que el agente que lo lea sepa dónde no mirar.
   */
  readonly fuera_de_alcance: readonly string[];
  /** El informe propone. La palabra está en el dato, no solo en la documentación. */
  readonly naturaleza: 'propuesta';
};

export type EntradaDeInforme = {
  readonly encabezado: Encabezado;
  readonly grupos: readonly GrupoDeFallas[];
  readonly fuente: string;
  readonly generado_en: string;
  readonly config?: ConfigSalud;
};

const FUERA_DE_ALCANCE: readonly string[] = [
  'Los incidentes de seguridad NO están aquí y no se agrupan: cada intento es una ' +
    'observación sobre un contacto concreto, y contarlos por huella convertiría una ' +
    'señal de seguridad en una estadística. Viven en `incidentes_seguridad`, uno a uno.',
  'Las actuaciones de los otros nueve vigías tampoco: un techo cruzado es un límite ' +
    'funcionando, no una falla.',
  'Un caso escalado por falta de FUENTE no cuenta como falla: es el invariante 1 ' +
    'actuando, y contarlo bajaría la disponibilidad justo cuando el sistema hace lo ' +
    'correcto. Ojo con la distinción, que decide la cifra — un escalado por falta de ' +
    'SUSTENTO sí cuenta: ahí se le dieron fragmentos al modelo y no los citó. Ver R-047.',
];

export function componer(entrada: EntradaDeInforme): InformeDeSalud {
  const config = entrada.config ?? SALUD;
  const visibles = entrada.grupos.slice(0, config.grupos_en_el_informe);

  return {
    version: 1,
    generado_en: entrada.generado_en,
    fuente: entrada.fuente,
    encabezado: entrada.encabezado,
    hallazgos: visibles.map((grupo) => ({ ...grupo, remedio: REMEDIOS[grupo.clase] })),
    grupos_omitidos: entrada.grupos.length - visibles.length,
    fuera_de_alcance: FUERA_DE_ALCANCE,
    naturaleza: 'propuesta',
  };
}

// ── El segundo formato ────────────────────────────────────────────────────────

function pct(x: number): string {
  return `${(x * 100).toFixed(1)} %`;
}

function ms(x: number | null): string {
  if (x === null) return '—';
  return x < 1000 ? `${Math.round(x)} ms` : `${(x / 1000).toFixed(1)} s`;
}

/**
 * El encabezado en prosa.
 *
 * Cuando el informe no es concluyente **no imprime las cuatro cifras**. No las
 * imprime con una advertencia al lado: no las imprime. Una cifra publicada con
 * una nota que la desmiente se cita sin la nota.
 */
function encabezadoEnMarkdown(e: Encabezado): string {
  if (!e.concluyente) {
    return [
      '## Encabezado',
      '',
      `**No concluyente.** ${e.observaciones} observación(es), y hacen falta ` +
        `${e.minimo_para_concluir} para que estas cifras signifiquen algo.`,
      '',
      `Con este denominador, «disponibilidad» y «tasa de error» son la misma cifra con ` +
        'distinta suerte, así que no se publican. Lo que sigue —los hallazgos agrupados— ' +
        'sí vale: un fallo observado una vez es un fallo observado, aunque no se pueda ' +
        'calcular una tasa con él.',
      '',
      `De momento: **${e.fallidas} fallida(s) de ${e.observaciones}**.`,
    ].join('\n');
  }

  return [
    '## Encabezado',
    '',
    `| Cifra | Valor | Sobre |`,
    `|---|---|---|`,
    `| Disponibilidad | **${pct(e.disponibilidad)}** | ${e.observaciones} operaciones |`,
    `| Tasa de error | ${pct(e.tasa_error)} | ${e.fallidas} fallidas |`,
    `| Tiempo medio de recuperación | ${ms(e.recuperacion_media_ms)} | ${e.episodios_cerrados} episodio(s) cerrado(s) |`,
    `| Presupuesto de error consumido | **${pct(e.presupuesto_error_consumido)}** | objetivo ${pct(e.objetivo_disponibilidad)} |`,
    '',
    e.presupuesto_error_consumido >= 1
      ? '> El presupuesto de error está **agotado**: el sistema va por debajo del objetivo declarado.'
      : `> Queda ${pct(Math.max(0, 1 - e.presupuesto_error_consumido))} del margen de fallo.`,
    ...(e.episodios_abiertos > 0
      ? [
          '',
          `> ${e.episodios_abiertos} episodio(s) **sin cerrar** al final de la ventana: la ` +
            'última operación observada seguía fallando. Su recuperación no entra en la media, ' +
            'porque todavía no ha ocurrido.',
        ]
      : []),
  ].join('\n');
}

function hallazgoEnMarkdown(h: Hallazgo, n: number): string {
  const lineas = [
    `### ${n}. \`${h.clase}\` en \`${h.operacion}\` — ${h.veces} vez(ces)`,
    '',
    `\`\`\`\n${h.plantilla}\n\`\`\``,
    '',
    `- **Huella:** \`${h.huella}\` · **primera vez:** ${h.primera_vez} · **última:** ${h.ultima_vez}`,
    `- **Por qué esa clase:** ${h.por_que_esa_clase}`,
    `- **Qué significa:** ${h.remedio.que_significa}`,
    `- **Qué hacer:** ${h.remedio.que_hacer}`,
    `- **Dónde mirar:** ${h.remedio.donde_mirar.map((d) => `\`${d}\``).join(' · ')}`,
    `- **¿Está en nuestra mano?** ${h.remedio.esta_en_nuestra_mano ? 'sí' : 'no — depende de un tercero'}`,
  ];

  if (h.reproduccion !== null) {
    lineas.push(
      '',
      '**Caso de reproducción** (saneado):',
      '',
      `| campo | valor |`,
      `|---|---|`,
      `| caso | \`${h.reproduccion.caso_id}\` |`,
      `| canal | ${h.reproduccion.canal} |`,
      `| clase de tarea | ${h.reproduccion.clase_tarea} |`,
      `| operación | \`${h.reproduccion.operacion}\` |`,
      `| mensaje | ${h.reproduccion.mensaje_saneado === '' ? '—' : `\`${h.reproduccion.mensaje_saneado}\``} |`,
    );
  } else {
    lineas.push('', '_Sin caso de reproducción: la falla no ocurrió dentro de un caso._');
  }

  return lineas.join('\n');
}

/**
 * El informe para una persona.
 *
 * Se deriva del objeto, entero. No hay ni un dato aquí que no venga de él, y esa
 * es la propiedad que impide que los dos formatos se contradigan.
 */
export function enMarkdown(informe: InformeDeSalud): string {
  const partes = [
    '# Informe de salud — Perímetro',
    '',
    `> Generado el ${informe.generado_en} desde ${informe.fuente}.`,
    '>',
    '> **Este informe propone; no aplica nada.** Es un diagnóstico para que una persona ' +
      '—o un agente de código— decida. Ninguna de las correcciones que sugiere se ha ' +
      'ejecutado, y el módulo que lo genera no puede ejecutarlas: no alcanza al ' +
      'repositorio, ni a la salida, ni a ningún adaptador.',
    '',
    encabezadoEnMarkdown(informe.encabezado),
    '',
    '## Hallazgos, agrupados por huella',
    '',
  ];

  if (informe.hallazgos.length === 0) {
    partes.push('Ninguna falla en la ventana. Mil errores idénticos serían una fila; cero son ninguna.');
  } else {
    partes.push(
      `${informe.hallazgos.length} grupo(s). Mil errores idénticos son un problema con ` +
        'contador, no mil incidentes.',
      '',
      ...informe.hallazgos.map((h, i) => hallazgoEnMarkdown(h, i + 1)).flatMap((t) => [t, '']),
    );
  }

  if (informe.grupos_omitidos > 0) {
    partes.push(
      '',
      `> **${informe.grupos_omitidos} grupo(s) más no se enseñan** por el tope de ` +
        '`config/salud.json`. Se dice en vez de callarse: un informe recortado en silencio ' +
        'se lee como completo.',
    );
  }

  partes.push('', '## Qué NO cubre este informe', '', ...informe.fuera_de_alcance.map((x) => `- ${x}`), '');

  return partes.join('\n');
}
