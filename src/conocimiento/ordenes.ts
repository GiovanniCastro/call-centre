// Órdenes de línea para la base de conocimiento.
//
//   node src/conocimiento/ordenes.ts ingerir
//   node src/conocimiento/ordenes.ts consultar "¿puedo cancelar y recuperar la prima?"
//   node src/conocimiento/ordenes.ts verificar
//   node src/conocimiento/ordenes.ts reindexar
//
// `consultar` existe sobre todo para calibrar el umbral: imprime la puntuación de
// cada fragmento, así que se puede ver a qué distancia quedan las preguntas que
// el corpus sí cubre de las que no. Un umbral elegido a ojo y un umbral elegido
// mirando esas dos distribuciones no son el mismo número.

import { CONOCIMIENTO } from '../core/conocimiento/config.ts';
import { crearRecuperador } from '../core/conocimiento/recuperar.ts';
import type { DocumentoFuente } from '../core/conocimiento/documento.ts';
import { crearConsultador, type Consultador } from '../repos/cliente.ts';
import { migrar } from '../repos/migrar.ts';
import {
  documentosRegistrados,
  olvidarDocumento,
  registrarDocumento,
  verificarSumas,
} from '../repos/documentos.ts';
import { ingerir, type Persistencia } from './ingestar.ts';
import { sumasEnDisco } from './leer.ts';
import { construirAlmacen, construirEmbeddings } from './registrar.ts';

function persistenciaSobre(bd: Consultador): Persistencia {
  return {
    async registrados() {
      return documentosRegistrados(bd);
    },
    async registrar(documento: DocumentoFuente, fragmentos: number, bytes: number, modelo: string) {
      await registrarDocumento(bd, {
        id: documento.documento_id,
        ruta: documento.procedencia.ruta,
        titulo: documento.titulo,
        suma: documento.suma,
        origen: documento.procedencia.origen,
        subido_por: documento.procedencia.subido_por,
        fragmentos,
        bytes,
        modelo_embeddings: modelo,
      });
    },
    async olvidar(id: string) {
      await olvidarDocumento(bd, id);
    },
  };
}

async function abrirBase(): Promise<Consultador | null> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.trim() === '') {
    console.warn(
      '⚠  Sin DATABASE_URL: la ingestión funciona, pero deja de ser incremental —no hay\n' +
        '   dónde recordar qué suma tenía cada documento— y no hay alerta de modificación\n' +
        '   externa. Todo se reindexa en cada pasada.\n',
    );
    return null;
  }
  const bd = crearConsultador(url);
  await migrar(bd);
  return bd;
}

const opcionesLectura = {
  carpeta: CONOCIMIENTO.ingesta.carpeta,
  extensiones: CONOCIMIENTO.ingesta.extensiones,
  prefijos_excluidos: CONOCIMIENTO.ingesta.prefijos_excluidos,
};

async function ordenIngerir(borrarPrimero: boolean): Promise<void> {
  const embeddings = construirEmbeddings(CONOCIMIENTO);
  const almacen = construirAlmacen(CONOCIMIENTO);
  const bd = await abrirBase();

  if (borrarPrimero) {
    await almacen.borrarColeccion();
    if (bd !== null) {
      for (const id of (await documentosRegistrados(bd)).keys()) await olvidarDocumento(bd, id);
    }
    console.warn('Colección borrada. Se reindexa todo.\n');
  }

  console.warn(`Ingiriendo «${CONOCIMIENTO.ingesta.carpeta}» con ${embeddings.nombre}…`);

  const inicio = process.hrtime.bigint();
  const resultado = await ingerir({
    config: CONOCIMIENTO,
    embeddings,
    almacen,
    persistencia: bd === null ? undefined : persistenciaSobre(bd),
    avisar: (linea) => console.warn(linea),
  });
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6;

  console.warn(
    `\nLeídos ${resultado.leidos} · indexados ${resultado.indexados} · sin cambios ` +
      `${resultado.sin_cambios} · retirados ${resultado.retirados} · rechazados ` +
      `${resultado.rechazados.length}`,
  );
  console.warn(
    `${resultado.fragmentos} fragmentos escritos · ${resultado.total_en_indice} en el índice · ` +
      `${(ms / 1000).toFixed(1)} s`,
  );

  await bd?.cerrar();
}

async function ordenConsultar(consulta: string): Promise<void> {
  const embeddings = construirEmbeddings(CONOCIMIENTO);
  const almacen = construirAlmacen(CONOCIMIENTO);
  const recuperar = crearRecuperador(embeddings, almacen, CONOCIMIENTO);

  const resultado = await recuperar(consulta);

  console.warn(`\nConsulta: ${consulta}`);
  console.warn(`Umbral: ${resultado.umbral} (${CONOCIMIENTO.recuperacion.estado_umbral})\n`);

  if (!resultado.hay) {
    console.warn(
      `VACÍO — ${resultado.motivo}` +
        (resultado.mejor === null ? '' : `. Mejor puntuación descartada: ${resultado.mejor.toFixed(3)}`),
    );
    console.warn(
      '\nEsto es el invariante 1 actuando: sin fragmento por encima del umbral, el agente\n' +
        'no responde y escala. No completa con conocimiento del modelo.',
    );
    return;
  }

  for (const fragmento of resultado.fragmentos) {
    console.warn(`${fragmento.puntuacion.toFixed(3)}  ${fragmento.titulo} › ${fragmento.seccion}`);
    console.warn(`        ${fragmento.fragmento_id}`);
    console.warn(`        ${fragmento.texto.slice(0, 160).replace(/\s+/g, ' ')}…\n`);
  }
}

async function ordenVerificar(): Promise<void> {
  const bd = await abrirBase();
  if (bd === null) {
    console.warn('Sin DATABASE_URL no hay sumas registradas contra las que comparar.');
    return;
  }

  const alertas = await verificarSumas(bd, await sumasEnDisco(opcionesLectura));

  if (alertas.length === 0) {
    console.warn('Todas las sumas coinciden con lo registrado.');
  } else {
    console.warn(`⚠  ${alertas.length} documento(s) modificados fuera del flujo de ingestión:\n`);
    for (const alerta of alertas) {
      console.warn(`  ${alerta.ruta}`);
      console.warn(`     registrada: ${alerta.suma_registrada}`);
      console.warn(`     en disco:   ${alerta.suma_en_disco}\n`);
    }
    process.exitCode = 1;
  }

  await bd.cerrar();
}

const [orden, ...resto] = process.argv.slice(2);

switch (orden) {
  case 'ingerir':
    await ordenIngerir(false);
    break;
  case 'reindexar':
    await ordenIngerir(true);
    break;
  case 'consultar': {
    const consulta = resto.join(' ').trim();
    if (consulta === '') {
      console.error('Falta la consulta: `consultar "¿cuánto cuesta el seguro de inquilino?"`');
      process.exitCode = 1;
      break;
    }
    await ordenConsultar(consulta);
    break;
  }
  case 'verificar':
    await ordenVerificar();
    break;
  default:
    console.error(
      'Órdenes: ingerir · reindexar · consultar "…" · verificar\n' +
        'Ver docs/ENTORNO-LOCAL.md para lo que hace falta levantado.',
    );
    process.exitCode = 1;
}
