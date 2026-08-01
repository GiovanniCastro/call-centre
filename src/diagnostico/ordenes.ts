// `npm run maquina` — el informe de qué hay, qué cabe y qué falta.
//
//   npm run maquina        hardware, proveedores de nube y modelos locales
//
// Informa y recomienda; no instala. Deja el `ollama pull` escrito para copiar.

import { z } from 'zod';

import { describirProveedor } from '../core/inferencia/puerto.ts';
import { estadoDeTodos, REGISTRO } from '../providers/inferencia/registrar.ts';
import { salir } from '../salida/salir.ts';
import { avisoDeExtras } from '../salida/destinos.ts';
import { medirMaquina } from './maquina.ts';
import {
  evaluar,
  mayoresSinVerificar,
  mejorLocalParaRedactar,
  type ModeloInstalado,
} from './modelos.ts';

const EsquemaTags = z.object({
  models: z.array(z.object({ name: z.string(), size: z.number() })),
});

async function modelosInstalados(url: string): Promise<readonly ModeloInstalado[]> {
  try {
    const respuesta = await salir(`${url.replace(/\/+$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!respuesta.ok) return [];

    const cuerpo = EsquemaTags.safeParse(await respuesta.json());
    if (!cuerpo.success) return [];

    return cuerpo.data.models.map((m) => ({ nombre: m.name, bytes: m.size }));
  } catch {
    return [];
  }
}

const MARCAS: Readonly<Record<string, string>> = {
  cabe_en_vram: '✓',
  cabe_lento: '~',
  no_cabe: '✗',
};

const maquina = await medirMaquina();

console.warn('\n── Esta máquina ─────────────────────────────────────────────');
console.warn(`  CPU     ${maquina.cpu} · ${maquina.nucleos} hilos`);
console.warn(`  RAM     ${maquina.ram_gb} GB (${maquina.ram_libre_gb} libres)`);

if (maquina.gpus.length === 0) {
  console.warn('  GPU     no se detectó ninguna NVIDIA');
} else {
  for (const gpu of maquina.gpus) {
    console.warn(
      `  GPU     ${gpu.nombre} · ${gpu.vram_gb} GB VRAM (${gpu.vram_libre_gb} libres) · controlador ${gpu.controlador}`,
    );
  }
}
console.warn(`  ${maquina.nota_vram}`);

// ── Proveedores de nube ──────────────────────────────────────────────────────

console.warn('\n── Proveedores de nube ──────────────────────────────────────');
const estados = estadoDeTodos();
for (const estado of estados) console.warn(describirProveedor(estado));

const pendientes = estados.filter((e) => e.estado === 'no_configurado');
if (pendientes.length > 0) {
  console.warn('\n  Para activar uno, pega su clave en .env:\n');
  for (const estado of pendientes) {
    if (estado.estado !== 'no_configurado') continue;
    for (const requisito of estado.requisitos) {
      if (!estado.faltan.includes(requisito.variable)) continue;
      console.warn(`    ${requisito.variable}=`);
      console.warn(`        ${requisito.descripcion}`);
      console.warn(`        ${requisito.como_obtenerlo}\n`);
    }
  }
}

const sinAdaptador = estados.filter((e) => e.estado === 'sin_adaptador');
if (sinAdaptador.length > 0) {
  console.warn(
    `  · ${sinAdaptador.length} proveedor(es) declarados SIN adaptador escrito. Pegar la clave\n` +
      '    no los activaría: falta código, no credencial. Es distinto de lo de arriba\n' +
      '    y por eso se dice aparte.\n',
  );
}

// ── Modelos locales ──────────────────────────────────────────────────────────

const instalados = await modelosInstalados(REGISTRO.local.url_por_defecto);
const evaluaciones = evaluar(maquina, instalados);

console.warn('── Modelos locales ──────────────────────────────────────────');
console.warn('  ✓ corre en la tarjeta   ~ arranca pero lento   ✗ no cabe\n');

for (const e of evaluaciones) {
  const marca = MARCAS[e.veredicto] ?? '?';
  const estado = e.instalado ? 'instalado' : 'no instalado';
  const fiabilidad = e.verificado ? '' : ' · tamaño DECLARADO, sin verificar';
  console.warn(`  ${marca} ${e.modelo}  (${e.tamano_gb} GB · ${e.proposito} · ${estado}${fiabilidad})`);
  console.warn(`      ${e.explicacion}`);
  if (e.para_mejorar !== null) console.warn(`      para mejorarlo: ${e.para_mejorar}`);
  if (!e.instalado && e.veredicto !== 'no_cabe') {
    console.warn(`      ollama pull ${e.modelo}`);
  }
  console.warn('');
}

const mejor = mejorLocalParaRedactar(evaluaciones);
const enPolitica = (await import('../core/enrutador/politica.ts')).POLITICA.modelos.local;
const evaluacionDePolitica = evaluaciones.find((e) => e.modelo === enPolitica);

console.warn('── Recomendación ────────────────────────────────────────────');

if (mejor === null) {
  console.warn(
    '  Ningún modelo de redacción corre a velocidad plena en esta máquina.\n' +
      '  Con el hardware actual, la comparación local/nube del panel mediría un local\n' +
      '  derramado a RAM — y haría ganar a la nube por un motivo que no es la nube.',
  );
} else {
  console.warn(`  Mejor local para redactar aquí: ${mejor.modelo} (${mejor.explicacion}).`);

  const mayores = mayoresSinVerificar(evaluaciones, mejor);
  if (mayores.length > 0) {
    console.warn(
      `\n  Hay candidatos mayores que también cabrían —${mayores.map((m) => m.modelo).join(', ')}—\n` +
        '  pero su tamaño está declarado, no medido, y no se recomienda una decisión sobre\n' +
        '  una cifra que nadie ha comprobado. Instala uno y este informe lo medirá.',
    );
  }
}

if (evaluacionDePolitica !== undefined && evaluacionDePolitica.veredicto !== 'cabe_en_vram') {
  console.warn(
    `\n  ⚠  config/politica.json usa «${enPolitica}» como local, y en esta máquina\n` +
      `     ${evaluacionDePolitica.explicacion}.\n` +
      `     ${evaluacionDePolitica.para_mejorar ?? ''}\n` +
      (mejor === null
        ? ''
        : `     Alternativa que sí cabe: ${mejor.modelo}. Cambiarlo es editar politica.json.\n`),
  );
}

const aviso = avisoDeExtras();
if (aviso !== null) console.warn(`\n${aviso}`);

console.warn(
  '\n  Este informe propone; no instala. Las órdenes `ollama pull` están escritas\n' +
    '  para copiar, no se ejecutan solas.\n',
);
