// Qué máquina es esta, y qué modelos locales caben en ella.
//
// Existe por dos motivos. Uno práctico: responder a «¿qué puedo correr aquí, y
// si no, qué me falta?» sin que nadie tenga que adivinarlo. Y otro del proyecto:
// `config/maquina-referencia.json` está en estado PROVISIONAL y es uno de los
// bloqueantes del canon —«sin definirla, las cifras de costo local no se pueden
// defender»—. Medir la máquina de verdad es el primer paso para cerrarlo.
//
// **Mide; no instala.** Deja el `ollama pull` escrito para copiar. El resto del
// proyecto exige confirmar las acciones que cambian el entorno, y descargar
// veinte gigabytes lo es.
//
// Sobre la VRAM: Windows la reporta mal. `Win32_VideoController.AdapterRAM` es
// un entero de 32 bits sin signo, así que cualquier tarjeta de más de 4 GB sale
// como 4 GB — esta máquina tiene una RTX 4070 de 12 GB y WMI decía 4. Por eso el
// dato sale de `nvidia-smi`, y si no está, se dice que no se sabe en lugar de
// usar la cifra mala.

import { execFile } from 'node:child_process';
import { totalmem, freemem, cpus, platform, arch } from 'node:os';
import { promisify } from 'node:util';

const ejecutar = promisify(execFile);

const BYTES_POR_GB = 1024 ** 3;

export type Gpu = {
  readonly nombre: string;
  readonly vram_gb: number;
  readonly vram_libre_gb: number;
  readonly controlador: string;
};

export type Maquina = {
  readonly plataforma: string;
  readonly arquitectura: string;
  readonly cpu: string;
  readonly nucleos: number;
  readonly ram_gb: number;
  readonly ram_libre_gb: number;
  readonly gpus: readonly Gpu[];
  /** Null cuando no hay GPU detectable: no es cero, es «no se sabe». */
  readonly vram_util_gb: number | null;
  readonly nota_vram: string;
};

function redondear(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * GPUs NVIDIA por `nvidia-smi`.
 *
 * Devuelve lista vacía si la orden no está —AMD, Intel, un servidor sin
 * tarjeta—. No se inventa un valor por omisión: sin dato, el informe lo dice y
 * cambia lo que recomienda, en lugar de recomendar sobre una cifra falsa.
 */
export async function detectarGpus(): Promise<readonly Gpu[]> {
  try {
    const { stdout } = await ejecutar(
      'nvidia-smi',
      ['--query-gpu=name,memory.total,memory.free,driver_version', '--format=csv,noheader,nounits'],
      { timeout: 5_000 },
    );

    return stdout
      .trim()
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '')
      .map((linea) => {
        const [nombre, total, libre, controlador] = linea.split(',').map((c) => c.trim());
        return {
          nombre: nombre ?? 'desconocida',
          // nvidia-smi informa en MiB.
          vram_gb: redondear(Number(total ?? 0) / 1024),
          vram_libre_gb: redondear(Number(libre ?? 0) / 1024),
          controlador: controlador ?? 'desconocido',
        };
      });
  } catch {
    return [];
  }
}

export async function medirMaquina(): Promise<Maquina> {
  const gpus = await detectarGpus();
  const nucleos = cpus();

  // Se toma la GPU más grande, no la suma: un modelo no se reparte entre dos
  // tarjetas por defecto, así que sumar prometería una capacidad que no hay.
  const mayor = gpus.reduce<Gpu | null>((a, g) => (a === null || g.vram_gb > a.vram_gb ? g : a), null);

  return {
    plataforma: platform(),
    arquitectura: arch(),
    cpu: nucleos[0]?.model.trim() ?? 'desconocida',
    nucleos: nucleos.length,
    ram_gb: redondear(totalmem() / BYTES_POR_GB),
    ram_libre_gb: redondear(freemem() / BYTES_POR_GB),
    gpus,
    vram_util_gb: mayor?.vram_gb ?? null,
    nota_vram:
      mayor === null
        ? 'No se detectó ninguna GPU NVIDIA. Sin `nvidia-smi` no hay cifra de VRAM fiable, así que el informe razona solo sobre la RAM del sistema — donde todo cabe y todo va lento.'
        : `Se usa la GPU con más memoria (${mayor.nombre}); no se suman varias, porque un modelo no se reparte entre tarjetas por omisión.`,
  };
}
