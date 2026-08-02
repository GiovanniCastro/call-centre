// Fase 6 — la proyección: derivación, saneo y un solo sentido.
//
// El criterio que más cuesta cumplir no es ninguna regla de Firebase: es que dos
// métricas que cuenten lo mismo se deriven del mismo campo. La maqueta original
// del panel enseñaba dos cifras distintas de escalados en la misma pantalla.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { derivar, type Agregados } from '../proyeccion/derivar.ts';
import { publicar, type TrazaParaPublicar } from '../proyeccion/publicar.ts';
import { comoNombreDeArchivo, DestinoDeArchivos } from '../proyeccion/destinos/archivos.ts';
import type { DestinoDeProyeccion, DocumentoProyectado } from '../proyeccion/puerto.ts';
import { decidirAcceso, ROL_NECESARIO, type AccionDePanel } from '../src/repos/accesos.ts';

const AGREGADOS: Agregados = {
  ventana: { desde: '2026-08-01T00:00:00.000Z', hasta: '2026-09-01T00:00:00.000Z' },
  por_resultado: [
    { resultado: 'resuelto', casos: 18 },
    { resultado: 'escalado_humano', casos: 47 },
    { resultado: 'bloqueado', casos: 3 },
    { resultado: 'descartado', casos: 2 },
  ],
  por_destino: [
    {
      destino_ejecucion: 'local',
      casos: 70,
      costo: '0',
      costo_provisional: true,
      latencia_media_ms: '13148',
      tokens_entrada: 100_000,
      tokens_salida: 20_000,
    },
  ],
  egreso: [
    { clase_sensibilidad: 'alta', casos: 12, con_egreso: 0 },
    { clase_sensibilidad: 'baja', casos: 58, con_egreso: 0 },
  ],
  escalados: [{ motivo_escalado: 'sustento por debajo del umbral', casos: 40 }],
  sustento: { campos_totales: 120, campos_con_procedencia: 84, casos_con_sustento: 55 },
  latencias: { casos: 70, mediana_ms: '11000', p95_ms: '37000' },
  supuestos_costeo: { equipo: 'SIN DEFINIR', estado: 'PROVISIONAL' },
  costo_provisional: true,
};

const AHORA = '2026-08-02T10:00:00.000Z';

class DestinoEspia implements DestinoDeProyeccion {
  readonly nombre = 'espia';
  readonly lotes: (readonly DocumentoProyectado[])[] = [];

  async publicar(documentos: readonly DocumentoProyectado[]): Promise<void> {
    this.lotes.push(documentos);
  }
}

describe('la derivación y la reconciliación', () => {
  test('DOS MÉTRICAS QUE CUENTAN LO MISMO SALEN DEL MISMO CAMPO', () => {
    // Criterio de aceptación de la fase 6. No se comprueba que coincidan por
    // casualidad: se comprueba que sean el mismo número.
    const p = derivar(AGREGADOS, AHORA);

    assert.equal(p.kpi.escalados_a_humano, 47);
    assert.equal(p.reparto.escalados_a_humano, p.kpi.escalados_a_humano);
  });

  test('cambiar el origen cambia LAS DOS a la vez', () => {
    // La prueba de verdad: si hubiera dos cálculos, uno se movería y el otro no.
    const otros: Agregados = {
      ...AGREGADOS,
      por_resultado: [
        { resultado: 'resuelto', casos: 18 },
        { resultado: 'escalado_humano', casos: 5 },
      ],
    };

    const p = derivar(otros, AHORA);
    assert.equal(p.kpi.escalados_a_humano, 5);
    assert.equal(p.reparto.escalados_a_humano, 5);
  });

  test('el total de casos es la suma de los cuatro desenlaces, no una consulta aparte', () => {
    assert.equal(derivar(AGREGADOS, AHORA).kpi.casos, 18 + 47 + 3 + 2);
  });

  test('SIN CASOS RESUELTOS, EL COSTO POR CASO ES NULL Y NO CERO', () => {
    const sinResueltos: Agregados = {
      ...AGREGADOS,
      por_resultado: [{ resultado: 'escalado_humano', casos: 10 }],
    };

    // Cero diría «gratis», que es lo contrario de la verdad cuando no se resolvió
    // nada habiendo gastado. Es el mismo defecto que R-031 encontró en el informe.
    assert.equal(derivar(sinResueltos, AHORA).kpi.costo_por_resuelto, null);
  });

  test('la marca de costo provisional viaja con la cifra', () => {
    // Separarlas permitiría enseñar el número sin la marca.
    assert.equal(derivar(AGREGADOS, AHORA).costeo.provisional, true);
    assert.deepEqual(derivar(AGREGADOS, AHORA).costeo.supuestos, AGREGADOS.supuestos_costeo);
  });

  test('EL PERÍMETRO SALE CON DENOMINADOR, Y CON DENOMINADOR CERO NO AFIRMA NADA', () => {
    const p = derivar(AGREGADOS, AHORA);
    const alta = p.perimetro.find((x) => x.clase_sensibilidad === 'alta');

    assert.equal(alta?.casos, 12);
    assert.equal(alta?.retenidos, 12);
    assert.equal(alta?.como_texto, '12 de 12 retenidos');

    const vacio = derivar(
      { ...AGREGADOS, egreso: [{ clase_sensibilidad: 'alta', casos: 0, con_egreso: 0 }] },
      AHORA,
    );
    assert.match(vacio.perimetro[0]?.como_texto ?? '', /no hay nada que afirmar/);
  });

  test('una proporción sin denominador es null, no 0 ni 1', () => {
    const vacio = derivar({ ...AGREGADOS, por_resultado: [] }, AHORA);
    // Las dos serían afirmaciones sacadas de ninguna observación, y el panel las
    // enseñaría como porcentaje.
    assert.equal(vacio.kpi.resueltos_sin_intervencion, null);
  });
});

describe('el publicador', () => {
  const TRAZA: TrazaParaPublicar = {
    caso_id: 'lote:v1:001',
    marca_tiempo: AHORA,
    canal: 'lote',
    clase_tarea: 'catalogo',
    clase_sensibilidad: 'baja',
    destino_ejecucion: 'local',
    desvio_ejecucion: 'ninguno',
    resultado: 'resuelto',
    motivo_decision: 'regla: catálogo va a local',
    motivo_escalado: null,
    fuentes: ['f141:8f86f9b0:0001'],
    hubo_egreso: false,
    latencia_ms: 11_000,
    costo: 0,
    costo_provisional: true,
  };

  test('publica agregados y trazas en rutas distintas', async () => {
    const destino = new DestinoEspia();
    const r = await publicar(destino, AGREGADOS, [TRAZA], AHORA, () => {});

    assert.equal(r.documentos, 2);
    const rutas = destino.lotes[0]?.map((d) => d.ruta) ?? [];
    assert.ok(rutas.some((x) => x.startsWith('agregados/')));
    assert.ok(rutas.includes('trazas/lote:v1:001'));
  });

  test('TODO LO QUE SE PUBLICA PASA POR EL SANEO', async () => {
    // Publicar es salir. Un dato que llega a Firestore ha salido del perímetro
    // tanto como uno que va a la API de un proveedor.
    const destino = new DestinoEspia();
    const avisos: string[] = [];

    const sucia: TrazaParaPublicar = {
      ...TRAZA,
      motivo_decision: 'el cliente dijo que su SSN es 123-45-6789',
    };

    const r = await publicar(destino, AGREGADOS, [sucia], AHORA, (l) => avisos.push(l));

    const publicado = JSON.stringify(destino.lotes[0]);
    assert.ok(!publicado.includes('123-45-6789'), 'el identificador salió sin enmascarar');
    assert.ok(publicado.includes('«ssn_1»'), 'no se sustituyó por un token');

    // Y NO SE CALLA. Que el saneo tenga que actuar aquí significa que un dato
    // sensible llegó a la tabla de eventos: es un incidente del perímetro.
    assert.ok(r.enmascarados.includes('ssn'));
    assert.equal(avisos.length, 1);
    assert.match(avisos[0] ?? '', /INCIDENTE DE PERÍMETRO/);
  });

  test('el aviso dice el TIPO, nunca el valor', async () => {
    // Un aviso que citara lo que encontró volvería a filtrar lo que acaba de tapar.
    const avisos: string[] = [];
    await publicar(
      new DestinoEspia(),
      AGREGADOS,
      [{ ...TRAZA, motivo_decision: 'SSN 123-45-6789' }],
      AHORA,
      (l) => avisos.push(l),
    );

    assert.ok(!(avisos[0] ?? '').includes('123-45-6789'));
  });

  test('se publica aunque el saneo actúe: lo enmascarado es más seguro que lo no publicado', async () => {
    // Detener no retira el dato —ya está en la tabla de eventos— y solo consigue
    // que el panel deje de actualizarse sin que nadie sepa por qué.
    const destino = new DestinoEspia();
    await publicar(
      destino,
      AGREGADOS,
      [{ ...TRAZA, motivo_decision: 'SSN 123-45-6789' }],
      AHORA,
      () => {},
    );

    assert.equal(destino.lotes.length, 1);
  });

  test('EL PUERTO NO SABE LEER: el invariante 8 está en el tipo', () => {
    // Un publicador que no puede leer del destino no puede traer al perímetro
    // algo que venga de fuera, ni por descuido ni por un cambio futuro.
    const destino: DestinoDeProyeccion = new DestinoEspia();
    const comoObjeto = destino as unknown as Record<string, unknown>;

    assert.equal(typeof comoObjeto['publicar'], 'function');
    for (const nombre of ['leer', 'obtener', 'consultar', 'suscribir']) {
      assert.equal(typeof comoObjeto[nombre], 'undefined', `el puerto expone «${nombre}»`);
    }
  });

  test('el nombre de archivo es inyectivo: dos rutas distintas no chocan', () => {
    // Sustituir los caracteres ilegales por un guion sería más bonito y estaría
    // mal: `a:b` y `a-b` acabarían en el mismo archivo y uno pisaría al otro.
    assert.notEqual(comoNombreDeArchivo('trazas/a:b'), comoNombreDeArchivo('trazas/a-b'));
    // Y la barra sobrevive, porque sí separa colección de documento.
    assert.ok(comoNombreDeArchivo('trazas/lote:v1:001').startsWith('trazas/'));
  });
});

describe('el destino de archivos', () => {
  test('escribe cada documento en su ruta y el JSON queda completo', async () => {
    const carpeta = await mkdtemp(join(tmpdir(), 'proyeccion-'));
    const destino = new DestinoDeArchivos(carpeta);

    await publicar(destino, AGREGADOS, [], AHORA, () => {});

    const nombre = `${comoNombreDeArchivo(
      `agregados/${AGREGADOS.ventana.desde}_${AGREGADOS.ventana.hasta}`,
    )}.json`;
    const leido = JSON.parse(await readFile(join(carpeta, nombre), 'utf8')) as {
      kpi: { escalados_a_humano: number };
      reparto: { escalados_a_humano: number };
    };

    // La reconciliación sobrevive al viaje de ida y vuelta por JSON.
    assert.equal(leido.kpi.escalados_a_humano, 47);
    assert.equal(leido.reparto.escalados_a_humano, 47);
  });
});

describe('los dos roles del panel', () => {
  test('EL ROL DE MÉTRICAS NO PUEDE LEER UNA TRAZA', () => {
    // Criterio de aceptación de la fase 6. Ver cuántos casos se escalaron no es
    // ver lo que decían.
    const v = decidirAcceso({
      operador: 'op@ejemplo',
      rol: 'metricas',
      accion: 'leer_traza',
      recurso: 'trazas/lote:v1:001',
    });

    assert.equal(v.concedido, false);
    assert.ok(v.concedido === false && v.motivo.includes('no puede'));
  });

  test('el rol de trazas sí puede ver agregados: la separación no es simétrica', () => {
    assert.equal(
      decidirAcceso({
        operador: 'op@ejemplo',
        rol: 'trazas',
        accion: 'leer_agregados',
        recurso: 'agregados/x',
      }).concedido,
      true,
    );
  });

  test('la tabla de roles y las reglas de Firestore dicen lo mismo', async () => {
    // Dos sitios donde se decide lo mismo con código distinto acaban divergiendo.
    // Esto no los une, pero hace que separarse cueste una prueba en rojo.
    const reglas = await readFile('proyeccion/reglas/firestore.rules', 'utf8');

    for (const [accion, roles] of Object.entries(ROL_NECESARIO) as [
      AccionDePanel,
      readonly string[],
    ][]) {
      if (accion !== 'leer_traza') continue;
      // `trazas` exige rol de trazas y solo ese, en los dos sitios.
      assert.deepEqual(roles, ['trazas']);
      assert.match(reglas, /match \/trazas\/\{caso\} \{\s*allow read: if tieneRol\('trazas'\);/);
    }

    // Y nadie escribe, en ningún sitio.
    assert.match(reglas, /allow write: if false;/);
  });
});
