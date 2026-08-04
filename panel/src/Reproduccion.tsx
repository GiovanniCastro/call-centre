// La demo pública: lo que se enseña sin que nada se esté ejecutando.
//
// Aquí no hay cifras en vivo ni cifras inventadas. Hay ejecuciones registradas
// del lote de la fase 7, servidas desde la proyección. Y la pantalla lo dice
// arriba del todo, con el identificador del lote a la vista, porque una
// reproducción que no dice qué reproduce no se puede comprobar contra nada.
//
// Igual que la banda de demostración de la fase 6, la banda de reproducción
// cuelga del discriminante que trae los datos: para leer un caso hay que pasar
// por `es_reproduccion`.

import type { FuenteDeReproduccion } from './fuente.ts';
import type { CasoReproducido } from '../../proyeccion/demo.ts';

function pct(parte: number, total: number): string {
  return total === 0 ? '—' : `${((parte / total) * 100).toFixed(0)} %`;
}

function segundos(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function Modos({ fuente }: { fuente: FuenteDeReproduccion }): React.JSX.Element {
  return (
    <section>
      <h2>Los tres modos, sobre la misma carga</h2>
      <table>
        <thead>
          <tr>
            <th>Modo</th>
            <th>Casos</th>
            <th>Acierto</th>
            <th>Escalados</th>
            <th>Sin sustento</th>
            <th>Latencia media</th>
            <th>Costo por resuelto</th>
          </tr>
        </thead>
        <tbody>
          {fuente.datos.modos.map((m) =>
            m.corrido ? (
              <tr key={m.modo}>
                <td>{m.modo}</td>
                <td>{m.casos}</td>
                <td>
                  {m.aciertos} ({pct(m.aciertos, m.casos)})
                </td>
                <td>{m.escalados}</td>
                <td>{m.sin_sustento}</td>
                <td>{segundos(m.latencia_media_ms)}</td>
                {/* PROVISIONAL y no «$0.0000»: con la máquina de referencia sin
                    caracterizar, cero se lee como «gratis» y es falso (R-031). */}
                <td>{m.costo_provisional ? 'PROVISIONAL' : `$${m.costo_por_resuelto?.toFixed(4) ?? '—'}`}</td>
              </tr>
            ) : (
              // Un modo no corrido ocupa su fila entera con el motivo. No se
              // esconde ni se rellena con ceros: la comparación que falta es
              // parte de lo que hay que enseñar.
              <tr key={m.modo} className="alta">
                <td>{m.modo}</td>
                <td colSpan={6}>NO CORRIDO — {m.motivo ?? 'sin motivo registrado'}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}

function Caso({ caso }: { caso: CasoReproducido }): React.JSX.Element {
  return (
    <tr className={caso.clase_sensibilidad === 'alta' ? 'alta' : ''}>
      <td>
        <code>{caso.caso_id}</code>
      </td>
      <td>{caso.pregunta}</td>
      <td>{caso.categoria}</td>
      <td>{caso.resultado}</td>
      <td>{caso.destino_ejecucion}</td>
      <td>{caso.hubo_egreso ? 'sí' : 'no'}</td>
      <td>{caso.fuentes.length}</td>
      <td>{caso.vigias_que_actuaron.join(', ') || '—'}</td>
      <td>{caso.acerto ? '✓' : caso.por_que_no}</td>
    </tr>
  );
}

export function Reproduccion({ fuente }: { fuente: FuenteDeReproduccion }): React.JSX.Element {
  const { datos, casos } = fuente;

  return (
    <main>
      {fuente.es_reproduccion && (
        <div className="banda-demo" role="alert">
          <strong>Reproducción · lote {datos.lote}</strong>
          <span>{datos.aviso}</span>
        </div>
      )}

      <header>
        <h1>Perímetro · Demo pública</h1>
        <p className="origen">
          Lote <code>{datos.lote}</code> · publicado {datos.generado_en.slice(0, 16).replace('T', ' ')}{' '}
          · origen <code>{fuente.origen}</code>
        </p>
      </header>

      <Modos fuente={fuente} />

      <section>
        <h2>Caso por caso</h2>
        <p className="explica">
          {casos.length} caso(s) reproducidos. Los de sensibilidad alta van marcados: son los que
          nunca salieron del perímetro, y su columna de egreso es la afirmación central del
          proyecto.
        </p>
        <table>
          <thead>
            <tr>
              <th>Caso</th>
              <th>Pregunta</th>
              <th>Categoría</th>
              <th>Resultado</th>
              <th>Destino</th>
              <th>Egreso</th>
              <th>Fuentes</th>
              <th>Vigías</th>
              <th>Acierto</th>
            </tr>
          </thead>
          <tbody>
            {casos.map((c) => (
              <Caso key={`${c.modo}:${c.caso_id}`} caso={c} />
            ))}
          </tbody>
        </table>
      </section>

      <footer>
        Nada de esta pantalla se ejecuta al visitarla. Son ejecuciones registradas del lote{' '}
        <code>{datos.lote}</code>, servidas desde la proyección. Ninguna llamada a un modelo,
        ningún presupuesto consumido por visitante y ninguna dependencia de que el perímetro esté
        encendido.
      </footer>
    </main>
  );
}
