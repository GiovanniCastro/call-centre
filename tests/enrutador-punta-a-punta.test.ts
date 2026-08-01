// Fase 3 — el criterio que sostiene la tesis del proyecto.
//
//   «Una petición marcada como sensible jamás produce una llamada externa.
//    Prueba explícita con espía sobre el módulo de salida.»
//
// Los adaptadores de esta prueba **salen de verdad** por `salir()`. No son
// dobles que fingen: si el enrutador eligiera la nube, el módulo de salida lo
// registraría y la prueba lo vería. Un doble que no intenta salir probaría que
// el doble no sale.
//
// Los anfitriones son `.invalid`, que por norma no resuelve nunca (RFC 2606):
// la conexión falla rápido y sin depender de la red, pero el registro se emite
// ANTES de intentarla — que es justo la propiedad que se quiere comprobar.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { enrutar, type Planos } from '../src/core/enrutador/enrutar.ts';
import { politicaDesde, POLITICA } from '../src/core/enrutador/politica.ts';
import type {
  Inferencia,
  PeticionInferencia,
  RespuestaInferencia,
} from '../src/core/inferencia/puerto.ts';
import { listaDesde } from '../src/salida/destinos.ts';
import { registrandoSalidas, salir } from '../src/salida/salir.ts';
import type { DestinoEjecucion } from '../src/telemetry/evento.ts';

const LISTA = listaDesde(
  {
    version: 1 as const,
    destinos: {
      'nube.invalid': {
        clase: 'externo' as const,
        para: 'plano de nube de la prueba',
        esquemas: ['https' as const],
        egreso: true,
      },
      'local.invalid': {
        clase: 'perimetro' as const,
        para: 'plano local de la prueba',
        esquemas: ['http' as const],
        egreso: false,
      },
    },
    permitir_por_entorno: { variable: 'DESTINOS_EXTRA' },
  },
  {},
);

/** Un adaptador que sale de verdad y luego devuelve algo fijo. */
class AdaptadorQueSale implements Inferencia {
  readonly nombre: string;
  readonly modelo: string;
  peticiones: PeticionInferencia[] = [];

  readonly destino: DestinoEjecucion;
  private readonly url: string;
  private readonly falla: boolean;

  // Campos declarados y asignados a mano: el proyecto corre con
  // `erasableSyntaxOnly`, que prohíbe las propiedades de parámetro.
  constructor(destino: DestinoEjecucion, url: string, falla = false) {
    this.destino = destino;
    this.url = url;
    this.falla = falla;
    this.modelo = `${destino}-de-prueba`;
    this.nombre = `prueba:${destino}`;
  }

  async redactar(peticion: PeticionInferencia): Promise<RespuestaInferencia> {
    this.peticiones.push(peticion);

    // La conexión no llega a ningún sitio; lo que importa es que pasó por el
    // módulo de salida y quedó registrada.
    await salir(this.url, { method: 'POST', body: peticion.mensaje }, LISTA).catch(() => undefined);

    if (this.falla) throw new Error('el plano no alcanzó (simulado)');

    return {
      texto: `respondido por ${this.destino}: ${peticion.mensaje}`,
      modelo: this.modelo,
      tokens_entrada: 10,
      tokens_salida: 5,
      latencia_ms: 1,
    };
  }

  async disponible(): Promise<{ ok: true }> {
    return { ok: true };
  }
}

function planos(opciones: { readonly localFalla?: boolean } = {}): Planos & {
  local: AdaptadorQueSale;
  nube: AdaptadorQueSale;
} {
  return {
    local: new AdaptadorQueSale('local', 'http://local.invalid/redactar', opciones.localFalla),
    nube: new AdaptadorQueSale('nube', 'https://nube.invalid/redactar'),
  };
}

const ENTRADA = {
  instrucciones: 'Eres el agente de Nimbo Seguros.',
  fragmentos: [],
};

describe('el enrutador de punta a punta', () => {
  test('UNA PETICIÓN SENSIBLE JAMÁS PRODUCE UNA LLAMADA EXTERNA', async () => {
    const p = planos();

    const { resultado, salidas } = await registrandoSalidas(() =>
      enrutar({ ...ENTRADA, mensaje: 'Mi número de seguro social es 123-45-6789, ¿qué cubro?' }, p),
    );

    assert.equal(resultado.clasificacion.clase_sensibilidad, 'alta');
    assert.equal(resultado.destino_ejecucion, 'local');

    // El espía: ni una sola salida con egreso. No «ninguna a Anthropic» —
    // ninguna que abandonara el perímetro, sea a donde sea.
    assert.ok(salidas.length > 0, 'el adaptador local no llegó a salir: la prueba no probó nada');
    assert.deepEqual(
      salidas.filter((s) => s.egreso),
      [],
      'un caso de sensibilidad alta produjo egreso',
    );
    assert.equal(p.nube.peticiones.length, 0, 'se llamó al plano de nube');
  });

  test('lo que sale NO contiene el dato, ni siquiera hacia el plano local', async () => {
    const p = planos();
    await enrutar({ ...ENTRADA, mensaje: 'mi ssn es 123-45-6789' }, p);

    const enviado = p.local.peticiones[0]?.mensaje ?? '';
    assert.ok(!enviado.includes('123-45-6789'), 'el adaptador recibió el dato en claro');
    assert.match(enviado, /«ssn_1»/);
  });

  test('el cliente recibe su dato de vuelta, no el token', async () => {
    const p = planos();
    const resultado = await enrutar({ ...ENTRADA, mensaje: 'mi ssn es 123-45-6789' }, p);

    // La restitución ocurre dentro del perímetro: fuera viajó el token.
    assert.match(resultado.texto, /123-45-6789/);
  });

  test('un caso NO sensible sí sale, y queda contado como egreso', async () => {
    // El contrapunto del primero. Sin esto, «cero egresos» podría significar que
    // el sistema no sale nunca, y el vigía de perímetro contaría 0 de 0.
    const p = planos();

    const { resultado, salidas } = await registrandoSalidas(() =>
      enrutar({ ...ENTRADA, mensaje: 'Llevo tres semanas esperando y nadie me contesta' }, p),
    );

    assert.equal(resultado.clasificacion.clase_sensibilidad, 'baja');
    assert.equal(resultado.destino_ejecucion, 'nube');
    assert.equal(salidas.filter((s) => s.egreso).length, 1);
  });

  test('DOS CASOS A LA VEZ NO SE MEZCLAN LAS CIFRAS DE EGRESO', async () => {
    // Los observadores del módulo son globales; el recuento por caso no puede
    // serlo, o un caso diría que sacó datos que sacó otro.
    const [sensible, corriente] = await Promise.all([
      registrandoSalidas(() =>
        enrutar({ ...ENTRADA, mensaje: 'mi ssn es 123-45-6789' }, planos()),
      ),
      registrandoSalidas(() =>
        enrutar({ ...ENTRADA, mensaje: 'llevo tres semanas esperando' }, planos()),
      ),
    ]);

    assert.deepEqual(sensible.salidas.filter((s) => s.egreso), []);
    assert.equal(corriente.salidas.filter((s) => s.egreso).length, 1);
  });
});

describe('el respaldo', () => {
  test('un local que no alcanza se DESVÍA, y se registra como desvío', async () => {
    const p = planos({ localFalla: true });

    const resultado = await enrutar(
      { ...ENTRADA, mensaje: '¿cuánto cuesta el seguro de inquilino?' },
      p,
    );

    assert.equal(resultado.destino_ejecucion, 'nube');
    assert.equal(resultado.desvio_ejecucion, 'local_a_nube');
    assert.match(resultado.motivo_desvio ?? '', /no alcanzó/);
  });

  test('UN DESVÍO NO ES UN ESCALADO A HUMANO', async () => {
    // R-002: son dos hechos distintos, y contarlos juntos produce dos cifras
    // para lo mismo. El enrutador no puede escalar; solo desviar.
    const resultado = await enrutar(
      { ...ENTRADA, mensaje: '¿cuánto cuesta el seguro?' },
      planos({ localFalla: true }),
    );

    assert.equal(resultado.desvio_ejecucion, 'local_a_nube');
    assert.ok(!('resultado' in resultado && resultado.resultado === 'escalado_humano'));
  });

  test('UN CASO RETENIDO POR LA REGLA DURA NO SE DESVÍA AUNQUE EL LOCAL FALLE', async () => {
    // Si el respaldo pudiera sacar lo retenido, el freno sería una sugerencia.
    const p = planos({ localFalla: true });

    const { salidas } = await registrandoSalidas(async () => {
      await assert.rejects(
        () => enrutar({ ...ENTRADA, mensaje: 'mi ssn es 123-45-6789' }, p),
        /no alcanzó \(simulado\)/,
      );
    });

    assert.equal(p.nube.peticiones.length, 0, 'la regla dura se desvió a la nube');
    assert.deepEqual(salidas.filter((s) => s.egreso), []);
  });

  test('sin plano de nube, el sistema funciona en local y lo dice al necesitarla', async () => {
    const soloLocal: Planos = { local: new AdaptadorQueSale('local', 'http://local.invalid/x') };

    // Un catálogo va a local: funciona.
    const ok = await enrutar({ ...ENTRADA, mensaje: '¿cuánto cuesta?' }, soloLocal);
    assert.equal(ok.destino_ejecucion, 'local');

    // Una queja va a nube: no hay, y el error dice qué hacer.
    await assert.rejects(
      () => enrutar({ ...ENTRADA, mensaje: 'esto es inaceptable' }, soloLocal),
      (error: Error) => error.name === 'SinPlanoDisponible' && /npm run maquina/.test(error.message),
    );
  });

  test('con el respaldo desactivado, el fallo se propaga en lugar de desviarse', async () => {
    const sinRespaldo = politicaDesde({
      ...POLITICA,
      respaldo: { ...POLITICA.respaldo, activo: false },
    });

    const p = planos({ localFalla: true });
    await assert.rejects(
      () => enrutar({ ...ENTRADA, mensaje: '¿cuánto cuesta?' }, p, sinRespaldo),
      /no alcanzó \(simulado\)/,
    );
    assert.equal(p.nube.peticiones.length, 0);
  });
});
