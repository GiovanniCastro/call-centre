// Fase 2, contra los servicios de verdad.
//
// Un doble de Qdrant probaría que el doble hace lo que le dijimos. Lo que hay que
// saber es otra cosa: que la colección se crea con las dimensiones correctas, que
// guardar y buscar mantienen la correspondencia entre vector y carga útil, y que
// el borrado por filtro alcanza justo los fragmentos de un documento. Eso solo lo
// contesta Qdrant.
//
// Corren cuando hay `QDRANT_URL` y `DATABASE_URL` — en el CI y, desde el
// 31-jul-2026, también en local. Sobre una colección propia, para no tocar el
// índice del corpus real.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { AlmacenQdrant } from '../src/conocimiento/qdrant.ts';
import {
  idDocumento,
  idFragmento,
  sumaDe,
  type Fragmento,
} from '../src/core/conocimiento/documento.ts';
import { crearConsultador, type Consultador } from '../src/repos/cliente.ts';
import { migrar } from '../src/repos/migrar.ts';
import {
  documentosRegistrados,
  olvidarDocumento,
  registrarDocumento,
  verificarSumas,
} from '../src/repos/documentos.ts';

const URL_QDRANT = process.env['QDRANT_URL'];
const URL_BD = process.env['DATABASE_URL'];

const DIMENSIONES = 4;

function fragmento(documentoRuta: string, orden: number, texto: string): Fragmento {
  const documentoId = idDocumento(documentoRuta);
  const suma = sumaDe(documentoRuta);
  return {
    fragmento_id: idFragmento(documentoId, suma, orden),
    documento_id: documentoId,
    titulo: 'Documento de prueba',
    seccion: `Sección ${orden}`,
    texto,
    orden,
    suma_documento: suma,
  };
}

describe('el almacén Qdrant', { skip: URL_QDRANT === undefined ? 'no hay QDRANT_URL' : false }, () => {
  const coleccion = `pruebas_${process.pid}`;
  let almacen: AlmacenQdrant;

  before(async () => {
    almacen = new AlmacenQdrant({ url: URL_QDRANT ?? '', coleccion, metrica: 'Cosine' });
    await almacen.borrarColeccion();
    await almacen.asegurarColeccion(DIMENSIONES);
  });

  after(async () => {
    await almacen.borrarColeccion();
  });

  test('asegurarColeccion es idempotente', async () => {
    await almacen.asegurarColeccion(DIMENSIONES);
    await almacen.asegurarColeccion(DIMENSIONES);
    assert.equal(await almacen.contar(), 0);
  });

  test('guardar y buscar conservan la carga útil, incluido el fragmento_id', async () => {
    const uno = fragmento('a.md', 0, 'El deducible de colisión es de quinientos dólares.');
    await almacen.guardar([uno], [[1, 0, 0, 0]]);

    const encontrados = await almacen.buscar([1, 0, 0, 0], 5);
    const primero = encontrados[0];

    assert.equal(encontrados.length, 1);
    assert.equal(primero?.fragmento_id, uno.fragmento_id);
    assert.equal(primero?.texto, uno.texto);
    assert.equal(primero?.seccion, uno.seccion);
    // Coseno con el mismo vector: la puntuación tiene que ser 1, o el umbral de
    // la configuración estaría comparándose contra otra escala.
    assert.ok((primero?.puntuacion ?? 0) > 0.99);
  });

  test('guardar dos veces el mismo fragmento no crea dos puntos', async () => {
    const uno = fragmento('b.md', 0, 'Texto que se guarda dos veces.');
    await almacen.guardar([uno], [[0, 1, 0, 0]]);
    const despues = await almacen.contar();
    await almacen.guardar([uno], [[0, 1, 0, 0]]);

    assert.equal(await almacen.contar(), despues);
  });

  test('borrarDocumento alcanza solo los fragmentos de ese documento', async () => {
    const dejar = fragmento('c.md', 0, 'Este se queda.');
    const borrar = [fragmento('d.md', 0, 'Este se va.'), fragmento('d.md', 1, 'Este también.')];

    await almacen.guardar([dejar, ...borrar], [
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ]);

    const antes = await almacen.contar();
    await almacen.borrarDocumento(borrar[0]?.documento_id ?? '');

    assert.equal(await almacen.contar(), antes - 2);
    const quedan = await almacen.buscar([0, 0, 1, 0], 10);
    assert.ok(quedan.some((f) => f.fragmento_id === dejar.fragmento_id));
  });

  test('una colección con otras dimensiones se rechaza en lugar de mezclarse', async () => {
    // Cambiar de modelo de embeddings cambia las dimensiones. Escribir igual
    // dejaría el índice con vectores de dos modelos, que no son comparables: las
    // puntuaciones dejan de significar nada y el umbral deja de querer decir lo
    // que dice.
    await assert.rejects(
      () => almacen.asegurarColeccion(DIMENSIONES + 1),
      /invalida el índice entero/,
    );
  });

  test('guardar con la correspondencia rota falla antes de escribir', async () => {
    await assert.rejects(
      () => almacen.guardar([fragmento('e.md', 0, 'x')], []),
      /correspondencia rota/,
    );
  });
});

describe(
  'la procedencia en PostgreSQL',
  { skip: URL_BD === undefined ? 'no hay DATABASE_URL' : false },
  () => {
    let bd: Consultador;
    const ruta = `pruebas/${process.pid}.md`;
    const id = idDocumento(ruta);

    before(async () => {
      bd = crearConsultador(URL_BD ?? '');
      await migrar(bd);
    });

    after(async () => {
      await olvidarDocumento(bd, id);
      await bd.cerrar();
    });

    test('registrar dos veces el mismo documento actualiza, no duplica', async () => {
      const base = {
        id,
        ruta,
        titulo: 'Prueba',
        suma: sumaDe('v1'),
        origen: 'carpeta' as const,
        subido_por: 'pruebas',
        fragmentos: 3,
        bytes: 100,
        modelo_embeddings: 'falso:uno',
      };

      await registrarDocumento(bd, base);
      await registrarDocumento(bd, { ...base, suma: sumaDe('v2'), fragmentos: 5 });

      const registrados = await documentosRegistrados(bd);
      const fila = registrados.get(id);

      assert.equal(fila?.suma, sumaDe('v2'));
      assert.equal(fila?.fragmentos, 5);
    });

    test('un documento modificado fuera del flujo dispara alerta de suma', async () => {
      // Criterio de aceptación de la fase 2. La comprobación es una comparación
      // de cadenas: o coinciden o no. No hay heurística que ajustar.
      const alertas = await verificarSumas(bd, new Map([[id, sumaDe('modificado a mano')]]));
      const mia = alertas.find((a) => a.id === id);

      assert.ok(mia !== undefined, 'no se detectó la modificación externa');
      assert.equal(mia.suma_registrada, sumaDe('v2'));
      assert.equal(mia.suma_en_disco, sumaDe('modificado a mano'));
    });

    test('un documento intacto no dispara alerta', async () => {
      const alertas = await verificarSumas(bd, new Map([[id, sumaDe('v2')]]));
      assert.ok(!alertas.some((a) => a.id === id));
    });

    test('un documento ausente del disco no es una alerta de suma', async () => {
      // Es un documento retirado, y lo resuelve la ingestión olvidándolo.
      // Confundirlos llenaría el panel de alertas por cada archivo borrado a
      // propósito.
      const alertas = await verificarSumas(bd, new Map());
      assert.ok(!alertas.some((a) => a.id === id));
    });
  },
);
