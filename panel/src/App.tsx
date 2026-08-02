// El panel. Lee la proyección publicada y la enseña.
//
// La jerarquía es la del plan y el orden importa: **costo por caso resuelto**
// primero, porque es la cifra que decide si el proyecto tiene sentido; luego
// resueltos sin intervención, tiempo de primera respuesta y escalados con su
// motivo. Lo que va arriba es lo que se mira; poner el reparto local/nube primero
// haría que la pantalla contara cómo funciona en vez de si sirve.
//
// Ninguna cifra se calcula aquí. Todas vienen derivadas del publicador, que las
// saca de PostgreSQL. Un panel que calculara sería un segundo sitio donde se
// decide qué significa «escalado», y acabaría discrepando del primero.

import { Calculadora } from './Calculadora.tsx';
import type { Fuente } from './fuente.ts';
import type { Proyeccion } from '../../proyeccion/derivar.ts';

function pct(v: number | null): string {
  // `null` no es 0 %: es «no hay denominador». Enseñarlo como 0 % sería una
  // afirmación sacada de ninguna observación.
  return v === null ? '—' : `${(v * 100).toFixed(0)} %`;
}

function ms(v: string | null): string {
  return v === null ? '—' : `${(Number(v) / 1000).toFixed(1)} s`;
}

/**
 * Una cifra de dinero, o por qué no hay cifra.
 *
 * Igual que en el informe de la fase 7 (R-031): con la máquina de referencia sin
 * caracterizar, el costo por caso saldría `$0.0000`, que se lee como «gratis» y
 * es falso. `config/maquina-referencia.json` lo prohíbe por escrito.
 */
function dinero(v: number | null, provisional: boolean): string {
  if (provisional) return 'PROVISIONAL';
  return v === null ? '—' : `$${v.toFixed(4)}`;
}

function Cifra({
  titulo,
  valor,
  nota,
}: {
  titulo: string;
  valor: string;
  nota?: string;
}): React.JSX.Element {
  return (
    <div className="cifra">
      <div className="cifra-titulo">{titulo}</div>
      <div className="cifra-valor">{valor}</div>
      {nota !== undefined && <div className="cifra-nota">{nota}</div>}
    </div>
  );
}

function Kpis({ p }: { p: Proyeccion }): React.JSX.Element {
  return (
    <section>
      <h2>Lo que decide si esto sirve</h2>
      <div className="rejilla">
        <Cifra
          titulo="Costo por caso resuelto"
          valor={dinero(p.kpi.costo_por_resuelto, p.costeo.provisional)}
          nota={
            p.costeo.provisional
              ? 'La máquina de referencia no está caracterizada. Con tarifa horaria cero el costo saldría $0.0000, que se lee como «gratis» y no lo es.'
              : Object.entries(p.costeo.supuestos)
                  .map(([k, v]) => `${k}: ${String(v)}`)
                  .join(' · ')
          }
        />
        <Cifra
          titulo="Resueltos sin intervención"
          valor={pct(p.kpi.resueltos_sin_intervencion)}
          nota={`${p.kpi.resueltos} de ${p.kpi.casos} casos`}
        />
        <Cifra
          titulo="Primera respuesta (mediana)"
          valor={ms(p.latencia.mediana_ms)}
          nota={`p95: ${ms(p.latencia.p95_ms)}`}
        />
        <Cifra
          titulo="Escalados a una persona"
          valor={String(p.kpi.escalados_a_humano)}
          nota={pct(p.kpi.casos === 0 ? null : p.kpi.escalados_a_humano / p.kpi.casos)}
        />
      </div>
    </section>
  );
}

function Perimetro({ p }: { p: Proyeccion }): React.JSX.Element {
  return (
    <section>
      <h2>Egreso por clase de sensibilidad</h2>
      <p className="explica">
        Numerador <strong>y</strong> denominador, siempre. «0 casos de egreso» puede querer decir
        «los retuvimos todos» o «no llegó ninguno», y son cosas muy distintas.
      </p>
      <table>
        <thead>
          <tr>
            <th>Sensibilidad</th>
            <th>Casos</th>
            <th>Con egreso</th>
            <th>Retenidos</th>
            <th>Cómo se lee</th>
          </tr>
        </thead>
        <tbody>
          {p.perimetro.map((f) => (
            <tr key={f.clase_sensibilidad} className={f.clase_sensibilidad === 'alta' ? 'alta' : ''}>
              <td>{f.clase_sensibilidad}</td>
              <td>{f.casos}</td>
              <td>{f.con_egreso}</td>
              <td>{f.retenidos}</td>
              <td>{f.como_texto}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Reparto({ p }: { p: Proyeccion }): React.JSX.Element {
  return (
    <section>
      <h2>Reparto local / nube</h2>
      <table>
        <thead>
          <tr>
            <th>Destino</th>
            <th>Casos</th>
            <th>Latencia media</th>
            <th>Tokens entrada</th>
            <th>Tokens salida</th>
            <th>Costo</th>
          </tr>
        </thead>
        <tbody>
          {p.reparto.por_destino.map((d) => (
            <tr key={d.destino_ejecucion}>
              <td>{d.destino_ejecucion}</td>
              <td>{d.casos}</td>
              <td>{ms(d.latencia_media_ms)}</td>
              <td>{d.tokens_entrada.toLocaleString('es')}</td>
              <td>{d.tokens_salida.toLocaleString('es')}</td>
              <td>{d.costo_provisional ? 'PROVISIONAL' : `$${Number(d.costo).toFixed(4)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="explica">
        Escalados a una persona: <strong>{p.reparto.escalados_a_humano}</strong>. Es el mismo
        número que arriba porque es <em>la misma variable</em>, no dos cuentas que coinciden.
      </p>
    </section>
  );
}

function Escalados({ p }: { p: Proyeccion }): React.JSX.Element {
  return (
    <section>
      <h2>Por qué se escaló</h2>
      {p.escalados_por_motivo.length === 0 ? (
        <p className="vacio">Ningún escalado en esta ventana.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Motivo</th>
              <th>Casos</th>
            </tr>
          </thead>
          <tbody>
            {p.escalados_por_motivo.map((e) => (
              <tr key={e.motivo_escalado}>
                <td>{e.motivo_escalado}</td>
                <td>{e.casos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="explica">
        Sustento agregado: <strong>{pct(p.sustento.proporcion)}</strong> —{' '}
        {p.sustento.con_procedencia} campos con procedencia válida sobre {p.sustento.totales}. Es
        una proporción contable, no una estimación.
      </p>
    </section>
  );
}

/**
 * La banda de demostración.
 *
 * No se renderiza porque alguien se acuerde: se renderiza porque `Fuente` es una
 * unión discriminada y TypeScript obliga a mirar el discriminante antes de poder
 * leer las cifras. Borrar esta banda deja el `aviso` sin usar y el panel sin
 * decir qué está enseñando — pero no hay forma de tener las cifras de
 * demostración sin haber pasado por aquí.
 */
export function App({ fuente }: { fuente: Fuente }): React.JSX.Element {
  const p = fuente.proyeccion;

  return (
    <main>
      {fuente.es_demostracion && (
        <div className="banda-demo" role="alert">
          <strong>Datos de demostración</strong>
          <span>{fuente.aviso}</span>
        </div>
      )}

      <header>
        <h1>Perímetro · Operación</h1>
        <p className="origen">
          Ventana {p.ventana.desde.slice(0, 10)} → {p.ventana.hasta.slice(0, 10)} · generado{' '}
          {p.generado_en.slice(0, 16).replace('T', ' ')} · origen <code>{fuente.origen}</code>
        </p>
      </header>

      {p.kpi.casos === 0 ? (
        <p className="vacio">
          Sin casos en esta ventana. El panel enseña vacío y no ceros: una cifra de cero sobre
          ninguna observación es una afirmación que nadie ha medido.
        </p>
      ) : (
        <>
          <Kpis p={p} />
          <Perimetro p={p} />
          <Reparto p={p} />
          <Escalados p={p} />
        </>
      )}

      <Calculadora />

      <footer>
        Toda cifra de esta pantalla sale de un evento registrado en PostgreSQL, derivado por el
        publicador. El panel no calcula nada.
      </footer>
    </main>
  );
}
