// `npm run publicar` — el publicador, de principio a fin.
//
// Lee PostgreSQL dentro del perímetro, deriva la proyección, la sanea y la
// escribe en el destino. Es el único componente con permiso de escritura sobre
// la proyección, y corre aquí dentro. Invariante 8.
//
// Sin `FIRESTORE_*` publica en archivos, y eso no es un modo degradado: la
// proyección en archivos es la que sirve la demo pública de la fase 8 —estática,
// sin presupuesto por visitante y sin depender de que el perímetro esté
// encendido— y la que permite construir y probar toda esta fase sin credenciales
// de nadie.

import { crearConsultador } from '../src/repos/cliente.ts';
import {
  egresoPorSensibilidad,
  latencias,
  porDestino,
  porMotivoDeEscalado,
  porResultado,
  sustentoAgregado,
  type Ventana,
} from '../src/repos/agregados.ts';
import { costear } from '../src/core/costeo/costear.ts';
import { POLITICA } from '../src/core/enrutador/politica.ts';
import { DestinoDeArchivos } from './destinos/archivos.ts';
import { publicar } from './publicar.ts';
import type { Agregados } from './derivar.ts';

const url = process.env['DATABASE_URL'];
if (url === undefined || url === '') {
  throw new Error(
    'Falta DATABASE_URL. El publicador lee del perímetro; sin base de datos no hay ' +
      'histórico que proyectar, y publicar una proyección vacía dejaría el panel ' +
      'enseñando ceros que parecerían medidos.',
  );
}

const carpeta = process.env['PROYECCION_CARPETA'] ?? 'proyeccion/salida';

// Ventana: por omisión, los últimos treinta días. Explícita y no «todo», porque
// «el costo» sin ventana no significa nada.
const hasta = process.argv[3] ?? new Date().toISOString();
const desde =
  process.argv[2] ?? new Date(Date.parse(hasta) - 30 * 24 * 3600 * 1000).toISOString();
const ventana: Ventana = { desde, hasta };

const bd = crearConsultador(url);

console.warn(`\nProyectando ${ventana.desde} → ${ventana.hasta}\n`);

const [resultado, destino_, egreso, escalados, sustento, latencia] = await Promise.all([
  porResultado(bd, ventana),
  porDestino(bd, ventana),
  egresoPorSensibilidad(bd, ventana),
  porMotivoDeEscalado(bd, ventana),
  sustentoAgregado(bd, ventana),
  latencias(bd, ventana),
]);

// Los supuestos del costeo local, para que el panel los enseñe JUNTO al número.
// «$0.004 por caso, RTX 4090 amortizada a tres años al 40 % de utilización» es
// creíble; «$0.004» a secas invita a una pregunta sin respuesta.
//
// Se piden con un tramo de duración cero: `costear` solo los devuelve cuando hay
// uso local, y eso está bien —van atados al uso, no a la configuración de hoy—
// pero aquí hace falta la ficha, no el importe.
const supuestos = costear([
  { destino: 'local', modelo: POLITICA.modelos.local, ms_computo: 0 },
]).supuestos;

const agregados: Agregados = {
  ventana,
  por_resultado: resultado,
  por_destino: destino_,
  egreso,
  escalados,
  sustento,
  latencias: latencia,
  supuestos_costeo: supuestos.local as unknown as Record<string, unknown>,
  // La marca sale de los eventos, no de la configuración de hoy: un evento
  // costeado con la máquina sin caracterizar sigue siendo provisional aunque
  // mañana se caracterice.
  costo_provisional: destino_.some((d) => d.costo_provisional),
};

// Trazas: **vacío en esta orden**. Publicarlas exige decidir cuáles, y esa
// decisión pertenece al operador que investiga un caso, no a un cron. La fase 8
// añadirá la publicación de las trazas del lote de la 7, que son las de la demo
// y no las de nadie.
const r = await publicar(new DestinoDeArchivos(carpeta), agregados, [], new Date().toISOString());

console.warn(`  ${r.documentos} documento(s) en ${carpeta}`);
console.warn(`  casos: ${r.proyeccion.kpi.casos} · escalados: ${r.proyeccion.kpi.escalados_a_humano}`);
if (r.proyeccion.kpi.casos === 0) {
  console.warn(
    '\n  Cero casos en la ventana. El panel enseñará vacío, no ceros: una cifra de\n' +
      '  cero sobre ninguna observación es una afirmación que nadie ha medido.\n',
  );
}
console.warn('');

await bd.cerrar();
