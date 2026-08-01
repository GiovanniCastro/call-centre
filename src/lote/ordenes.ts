// `npm run lote` — el lote entero, de principio a fin, con un solo comando.
//
// Criterio de aceptación de la fase 7. Un corredor que exija tres pasos y una
// variable de entorno bien puesta es un corredor que se ejecuta una vez y luego
// nadie repite, y entonces las cifras del portafolio envejecen sin que nadie se
// entere.

import { readFile, writeFile, mkdir } from 'node:fs/promises';

import { leerArchivo } from '../channels/lote/normalizar.ts';
import { CONOCIMIENTO } from '../core/conocimiento/config.ts';
import { crearRecuperador } from '../core/conocimiento/recuperar.ts';
import { RespuestaGraduada } from '../core/seguridad/graduada.ts';
import { VigiaDeBucle } from '../core/vigias/bucle.ts';
import { VigiaDePerimetro } from '../core/vigias/perimetro.ts';
import { VigiaDePresupuesto } from '../core/vigias/presupuesto.ts';
import { VigiaDeSustento } from '../core/vigias/sustento.ts';
import { VIGIAS } from '../core/vigias/config.ts';
import { construirAlmacen, construirEmbeddings } from '../conocimiento/registrar.ts';
import { estadoDeProveedor } from '../providers/inferencia/registrar.ts';
import { inferenciaLocal } from '../providers/inferencia/registrar.ts';
import { correr, type Modo, type Montaje } from './corredor.ts';
import { comoTexto } from './informe.ts';
import { POLITICA } from '../core/enrutador/politica.ts';

const RUTA = process.argv[2] ?? 'lote/casos.json';
const SALIDA = 'lote/resultados';

const archivo = leerArchivo(JSON.parse(await readFile(RUTA, 'utf8')));
console.warn(`\nLote «${archivo.lote}» — ${archivo.casos.length} casos\n`);

const embeddings = construirEmbeddings(CONOCIMIENTO);
const almacen = construirAlmacen(CONOCIMIENTO);
const recuperador = crearRecuperador(embeddings, almacen, CONOCIMIENTO);

const local = inferenciaLocal(POLITICA.modelos.local);
const estadoNube = estadoDeProveedor('anthropic');
const nube = estadoNube.estado === 'configurado' ? estadoNube.inferencia : undefined;

const montar: Montaje = async (modo: Modo) => {
  // Los guardianes se montan POR MODO, no una vez: compartirlos haría que el
  // denominador del vigía de perímetro acumulara los tres modos y «31 de 31»
  // pasara a ser «93 de 93» sin que nadie hubiera mandado noventa y tres casos.
  const perimetro = new VigiaDePerimetro();
  const guardianes = {
    bucle: new VigiaDeBucle({ limites: VIGIAS.bucle.limites }),
    perimetro,
    presupuesto: new VigiaDePresupuesto({
      techos: VIGIAS.presupuesto.techos_usd,
      fraccion_suave: VIGIAS.presupuesto.fraccion_suave,
    }),
    sustento: new VigiaDeSustento({ ventana: 10, umbral_vacios: 0.5, umbral_sustento: 0.7 }),
    graduada: new RespuestaGraduada({
      escalones: { observar: 0, limitar: 2, cuarentena: 3, detener_canal: 8 },
      cuarentena_ms: 60_000,
    }),
  };

  const disponible =
    modo === 'local' || nube !== undefined
      ? ({ ok: true } as const)
      : ({
          ok: false,
          motivo:
            'no hay ANTHROPIC_API_KEY: el plano de nube está declarado y sin configurar. ' +
            'Pega la clave en .env y relanza `npm run lote`; el informe se rehace entero.',
        } as const);

  return {
    deps: {
      guardianes,
      planos: { local, nube },
      async recuperar(consulta: string) {
        const r = await recuperador(consulta);
        return r.hay ? r.fragmentos : [];
      },
      mensajeDeContingencia: VIGIAS.presupuesto.mensaje_de_contingencia,
    },
    perimetro: () => perimetro.recuento(),
    disponible,
  };
};

const ejecuciones = await correr(archivo.casos, montar, undefined, (l) => console.warn(l));
const informe = comoTexto(ejecuciones);
console.warn(informe);

await mkdir(SALIDA, { recursive: true });
const marca = archivo.lote;
await writeFile(`${SALIDA}/${marca}.json`, JSON.stringify({ lote: marca, ejecuciones }, null, 2));
await writeFile(`${SALIDA}/${marca}.txt`, informe);

console.warn(`  Resultados en ${SALIDA}/${marca}.json y .txt\n`);
