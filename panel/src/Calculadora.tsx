// La calculadora de punto de equilibrio. Fase 6B.
//
// **Importa `costear` a través de `equilibrio.ts`. No reimplementa nada.** Es la
// única excepción a «el panel no importa código del perímetro», y la manda el
// manual con esas palabras: «Reimplementar el costeo» está en la lista de
// prohibido, y «la calculadora de la fase 6B importa `costear`» está escrito.
//
// La alternativa —copiar la fórmula aquí— daría dos sitios donde se decide cuánto
// cuesta un caso. El día que cambiara la política de costeo, el panel seguiría
// enseñando la cifra vieja y nadie lo notaría hasta que alguien comparase.

import { useState } from 'react';

import {
  costosPorModo,
  recomendar,
  utilizacionDe,
  volumenDeEquilibrio,
  type Escenario,
  type PerfilDeCaso,
} from '../../src/core/costeo/equilibrio.ts';

/**
 * El perfil del caso medio, medido por el corredor de la fase 7.
 *
 * No es una estimación: `ms_computo_local` es la latencia media de la corrida
 * registrada, y `fraccion_a_nube` la proporción de casos que el local no resolvió.
 * Ponerlos a ojo convertiría la vista honesta del híbrido en la que conviniera.
 */
const PERFIL_MEDIDO: PerfilDeCaso = {
  modelo_local: 'gemma4:latest',
  modelo_nube: 'claude-sonnet-5',
  ms_computo_local: 13_148,
  tokens_entrada: 1400,
  tokens_salida: 350,
  fraccion_a_nube: 0.2,
};

const INICIAL: Escenario = {
  volumen_mensual: 1000,
  costo_equipo: 2500,
  vida_util_anios: 3,
  utilizacion_minima: 0,
  potencia_vatios: 450,
  precio_kwh: 0.15,
  mantenimiento_anual: 120,
  caida_precio_nube: 0,
};

const CAMPOS: readonly {
  clave: keyof Escenario;
  etiqueta: string;
  paso: number;
  ayuda?: string;
}[] = [
  { clave: 'volumen_mensual', etiqueta: 'Casos al mes', paso: 100 },
  { clave: 'costo_equipo', etiqueta: 'Precio del equipo (USD)', paso: 100 },
  { clave: 'vida_util_anios', etiqueta: 'Amortización (años)', paso: 1 },
  {
    clave: 'utilizacion_minima',
    etiqueta: 'Utilización mínima',
    paso: 0.05,
    ayuda: 'Solo si la máquina también hace otro trabajo. La utilización de esta carga se deriva del volumen.',
  },
  { clave: 'potencia_vatios', etiqueta: 'Consumo bajo carga (W)', paso: 25 },
  { clave: 'precio_kwh', etiqueta: 'Precio del kWh (USD)', paso: 0.01 },
  { clave: 'mantenimiento_anual', etiqueta: 'Mantenimiento anual (USD)', paso: 20 },
  {
    clave: 'caida_precio_nube',
    etiqueta: 'Caída del precio de nube',
    paso: 0.05,
    ayuda: 'El argumento más fuerte contra comprar hardware. 0.3 es «la nube cuesta un 30 % menos».',
  },
];

export function Calculadora(): React.JSX.Element {
  const [escenario, setEscenario] = useState<Escenario>(INICIAL);

  const costos = costosPorModo(escenario, PERFIL_MEDIDO);
  const consejo = recomendar(escenario, PERFIL_MEDIDO);
  const equilibrio = volumenDeEquilibrio(escenario, PERFIL_MEDIDO);
  const uso = utilizacionDe(escenario, PERFIL_MEDIDO);
  const hibrido = costos.find((c) => c.modo === 'hibrido');

  return (
    <section>
      <h2>Punto de equilibrio</h2>
      <p className="explica">
        Las cifras salen de <code>costear</code>, la misma función que usó el corredor de la fase 7.
        Mover un parámetro cambia la tabla de precios que se le pasa, no la fórmula.
      </p>

      <div className="rejilla">
        {CAMPOS.map((campo) => (
          <label key={campo.clave} className="campo">
            <span className="cifra-titulo">{campo.etiqueta}</span>
            <input
              type="number"
              step={campo.paso}
              min={0}
              value={escenario[campo.clave]}
              onChange={(e) => {
                const v = Number(e.target.value);
                setEscenario((prev) => ({ ...prev, [campo.clave]: Number.isFinite(v) ? v : 0 }));
              }}
            />
            {campo.ayuda !== undefined && <span className="cifra-nota">{campo.ayuda}</span>}
          </label>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Modo</th>
            <th>Por caso</th>
            <th>Al mes</th>
          </tr>
        </thead>
        <tbody>
          {costos.map((c) => (
            <tr key={c.modo} className={c.modo === consejo.modo ? 'alta' : ''}>
              <td>{c.modo}</td>
              <td>${c.por_caso.toFixed(4)}</td>
              <td>${c.mensual.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rejilla">
        <Cifra
          titulo="Recomendación"
          valor={consejo.modo}
          nota={consejo.por_que}
        />
        <Cifra
          titulo="Equilibrio"
          valor={equilibrio === null ? 'nunca' : `${equilibrio.toLocaleString('es')} casos/mes`}
          nota={
            equilibrio === null
              ? 'Con estos parámetros el local no alcanza a la nube en ningún volumen razonable. Se dice «nunca» y no un número enorme, que se leería como una medida.'
              : 'Volumen a partir del cual la máquina sale más barata que la nube.'
          }
        />
        <Cifra
          titulo="Utilización de la máquina"
          valor={`${(uso.utilizacion * 100).toFixed(2)} %`}
          nota={
            uso.saturada
              ? 'SATURADA: este volumen no cabe en una sola máquina.'
              : 'Se deriva del volumen, no se asume. Es lo que hace que el equilibrio exista: con la máquina parada, cada caso carga con una porción enorme de la amortización.'
          }
        />
      </div>

      {hibrido?.correccion !== undefined && (
        <p className="explica">
          <strong>El híbrido, sin maquillar.</strong> De {escenario.volumen_mensual} casos,{' '}
          {hibrido.correccion.casos_a_nube} acaban en la nube porque el local no llegó, y esa
          corrección cuesta ${hibrido.correccion.costo_extra_mensual.toFixed(2)} al mes{' '}
          <em>además</em> del tiempo de cómputo local que ya se gastó. Descontarlo haría que el
          híbrido pareciera más barato de lo que es.
        </p>
      )}
    </section>
  );
}

function Cifra({
  titulo,
  valor,
  nota,
}: {
  titulo: string;
  valor: string;
  nota: string;
}): React.JSX.Element {
  return (
    <div className="cifra">
      <div className="cifra-titulo">{titulo}</div>
      <div className="cifra-valor">{valor}</div>
      <div className="cifra-nota">{nota}</div>
    </div>
  );
}
