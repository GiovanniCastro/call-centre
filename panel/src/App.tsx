// El panel de operación. Lee la proyección publicada y la enseña.
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
//
// Y lo que esta pantalla NO tiene, que también es una decisión: no hay selector
// de periodo ni línea de tendencia. La proyección trae una ventana y unos
// agregados sobre ella; no trae serie temporal. Un control que no puede cambiar
// nada, o una chispa dibujada a ojo, serían adorno con aspecto de medida.

import { Calculadora } from './Calculadora.tsx';
import { dinero, entero, esAusencia, fecha, fechaHora, pct, pctDe, segundos } from './formato.ts';
import {
  BarrasApiladas,
  Cabecera,
  Cifra,
  Leyenda,
  Partes,
  Pie,
  Rail,
  Tarjeta,
  type Columna,
  type Parte,
  type Seccion,
  type Tono,
} from './ui.tsx';
import type { Fuente } from './fuente.ts';
import type { Proyeccion } from '../../proyeccion/derivar.ts';

const SECCIONES: readonly Seccion[] = [
  { id: 'resumen', titulo: 'Operación', icono: 'cuadros' },
  { id: 'perimetro', titulo: 'Perímetro', icono: 'escudo' },
  { id: 'reparto', titulo: 'Reparto del enrutador', icono: 'nodos' },
  { id: 'escalados', titulo: 'Escalados', icono: 'pulso' },
  { id: 'economia', titulo: 'Punto de equilibrio', icono: 'moneda' },
];

/** El destino de ejecución decide el color, y el color quiere decir siempre lo mismo. */
function tonoDeDestino(destino: string): Tono {
  if (destino === 'local') return 'local';
  if (destino === 'nube') return 'nube';
  return 'gris';
}

function Kpis({ p }: { p: Proyeccion }): React.JSX.Element {
  const costo = dinero(p.kpi.costo_por_resuelto, p.costeo.provisional);

  return (
    <section className="grid kpis" id="resumen" aria-label="Indicadores principales">
      <Cifra
        destacada
        titulo="Costo por caso resuelto"
        valor={costo}
        ausencia={esAusencia(costo)}
        // Los supuestos, junto al número. «$0.004 por caso» a secas invita a una
        // pregunta sin respuesta; con la ficha del equipo al lado, es defendible.
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
        ausencia={esAusencia(pct(p.kpi.resueltos_sin_intervencion))}
        nota={`${entero(p.kpi.resueltos)} de ${entero(p.kpi.casos)} casos`}
      />
      <Cifra
        titulo="Primera respuesta"
        valor={segundos(p.latencia.mediana_ms)}
        ausencia={esAusencia(segundos(p.latencia.mediana_ms))}
        nota={`mediana · p95 en ${segundos(p.latencia.p95_ms)}`}
      />
      <Cifra
        titulo="Escalados a una persona"
        valor={entero(p.kpi.escalados_a_humano)}
        nota={`${pctDe(p.kpi.escalados_a_humano, p.kpi.casos)} de ${entero(p.kpi.casos)} casos atendidos`}
      />
    </section>
  );
}

/**
 * Egreso por clase de sensibilidad, con numerador **y** denominador.
 *
 * «0 casos de egreso» puede querer decir «los retuvimos todos» o «no llegó
 * ninguno», y son cosas muy distintas. Por eso la columna es la clase entera y
 * el color reparte dentro: la altura es el denominador, siempre a la vista.
 */
function PerimetroYReparto({ p }: { p: Proyeccion }): React.JSX.Element {
  const columnas: readonly Columna[] = p.perimetro.map((f) => ({
    etiqueta: f.clase_sensibilidad,
    segmentos: [
      { clave: 'con egreso', valor: f.con_egreso, tono: 'veto' },
      { clave: 'retenidos', valor: f.retenidos, tono: 'local' },
    ],
  }));

  const destinos: readonly Parte[] = p.reparto.por_destino.map((d) => ({
    etiqueta: d.destino_ejecucion,
    casos: d.casos,
    tono: tonoDeDestino(d.destino_ejecucion),
    detalle: segundos(d.latencia_media_ms),
  }));
  const casosConDestino = p.reparto.por_destino.reduce((s, d) => s + d.casos, 0);

  return (
    <section className="grid row2">
      <Tarjeta
        id="perimetro"
        titulo="Egreso por clase de sensibilidad"
        pista="Cada columna es una clase. La altura es cuántos casos hubo; el color, cuántos se retuvieron."
        extra={
          <Leyenda
            series={[
              { clave: 'Retenidos', tono: 'local' },
              { clave: 'Con egreso', tono: 'veto' },
            ]}
          />
        }
      >
        <BarrasApiladas columnas={columnas} />
        <p className="note">
          {p.perimetro.map((f) => (
            <span key={f.clase_sensibilidad}>
              <b>{f.clase_sensibilidad}</b>: {f.como_texto}.{' '}
            </span>
          ))}
          El denominador va con el número porque sin él «0 escapados» no afirma nada.
        </p>
      </Tarjeta>

      <Tarjeta
        id="reparto"
        titulo="Reparto del enrutador"
        pista={`Sobre ${entero(casosConDestino)} casos con destino registrado`}
      >
        <Partes partes={destinos} total={casosConDestino} />
        <p className="note">
          Escalados a una persona: <b>{entero(p.reparto.escalados_a_humano)}</b>. Es el mismo número
          que arriba porque es <em>la misma variable</em>, no dos cuentas que coinciden. Va aparte
          del reparto y no como una barra más: escalar es un desenlace, no un destino de ejecución,
          y mezclarlos daría dos denominadores en un solo gráfico.
        </p>
      </Tarjeta>
    </section>
  );
}

function EscaladosYDesenlaces({ p }: { p: Proyeccion }): React.JSX.Element {
  // Los cuatro desenlaces salen de `kpi`, que a su vez sale de un único recuento
  // en el publicador. No se vuelven a contar aquí.
  const desenlaces: readonly Parte[] = [
    { etiqueta: 'Resueltos', casos: p.kpi.resueltos, tono: 'local' },
    { etiqueta: 'Escalados a una persona', casos: p.kpi.escalados_a_humano, tono: 'esc' },
    { etiqueta: 'Bloqueados', casos: p.kpi.bloqueados, tono: 'veto' },
    { etiqueta: 'Descartados', casos: p.kpi.descartados, tono: 'gris' },
  ];

  return (
    <section className="grid row2">
      <Tarjeta
        id="escalados"
        titulo="Por qué se escaló"
        pista="El motivo se registra en el mismo evento que el desenlace"
      >
        {p.escalados_por_motivo.length === 0 ? (
          <p className="hint">Ningún escalado en esta ventana.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>Casos</th>
                  <th>De los escalados</th>
                </tr>
              </thead>
              <tbody>
                {p.escalados_por_motivo.map((e) => (
                  <tr key={e.motivo_escalado}>
                    <td>{e.motivo_escalado}</td>
                    <td className="mono">{entero(e.casos)}</td>
                    <td className="mono">{pctDe(e.casos, p.kpi.escalados_a_humano)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Desenlaces" pista={`Sobre ${entero(p.kpi.casos)} casos de la ventana`}>
        <Partes partes={desenlaces} total={p.kpi.casos} />
        <p className="note">
          Sustento agregado: <b>{pct(p.sustento.proporcion)}</b> — {entero(p.sustento.con_procedencia)}{' '}
          campos con procedencia válida sobre {entero(p.sustento.totales)}. Es una proporción
          contable, no una estimación: cada campo trae su <code>fragmento_id</code> y el verificador
          comprueba que exista, que se recuperara en esa ejecución y que el valor esté literalmente
          en el fragmento.
        </p>
      </Tarjeta>
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
    <div className="app">
      <Rail secciones={SECCIONES} />

      <main className="main">
        <Cabecera
          titulo="Operación"
          sub={`Ventana ${fecha(p.ventana.desde)} → ${fecha(p.ventana.hasta)} · derivado el ${fechaHora(p.generado_en)}`}
          marca={
            <>
              <i className="dot" aria-hidden="true" />
              {entero(p.kpi.casos)} casos en la ventana
            </>
          }
        />

        {fuente.es_demostracion && (
          <div className="banda-demo" role="alert">
            <strong>Datos de demostración</strong>
            <span>{fuente.aviso}</span>
          </div>
        )}

        {p.kpi.casos === 0 ? (
          <p className="vacio">
            Sin casos en esta ventana. El panel enseña vacío y no ceros: una cifra de cero sobre
            ninguna observación es una afirmación que nadie ha medido.
          </p>
        ) : (
          <>
            <Kpis p={p} />
            <PerimetroYReparto p={p} />
            <EscaladosYDesenlaces p={p} />
          </>
        )}

        <section className="grid row1" id="economia">
          <Calculadora />
        </section>

        <Pie>
          Toda cifra de esta pantalla sale de un evento registrado en PostgreSQL, derivado por el
          publicador. El panel no calcula nada. Origen: <code>{fuente.origen}</code>.
        </Pie>
      </main>
    </div>
  );
}
