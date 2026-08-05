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
//
// Misma maqueta que la pantalla de operación, y no por ahorrar código: son las
// mismas cifras miradas desde fuera. Que la demo pública se parezca a la consola
// del operador es parte de lo que se está enseñando — con la diferencia, dicha en
// la banda, de que esto ya ocurrió y aquello está ocurriendo.

import { dinero, entero, esAusencia, fechaHora, pctDe, segundos } from './formato.ts';
import {
  BarrasApiladas,
  Cabecera,
  Cifra,
  Etiqueta,
  Leyenda,
  Lista,
  Partes,
  Pie,
  Rail,
  SiNo,
  Tarjeta,
  type Columna,
  type Parte,
  type Renglon,
  type Seccion,
  type Tono,
} from './ui.tsx';
import type { FuenteDeReproduccion } from './fuente.ts';
import type { CasoReproducido, Reproduccion as Datos } from '../../proyeccion/demo.ts';

// El resumen de un modo, sacado del tipo que ya viaja en la reproducción. Se
// deriva en vez de importarse de `src/lote/` para que el panel siga alcanzando
// una sola cosa del perímetro: la forma de la proyección que lee.
type ResumenDeModo = Datos['modos'][number];

const SECCIONES: readonly Seccion[] = [
  { id: 'resumen', titulo: 'Resumen del lote', icono: 'cuadros' },
  { id: 'categorias', titulo: 'Casos por categoría', icono: 'nodos' },
  { id: 'modos', titulo: 'Los tres modos', icono: 'moneda' },
  { id: 'casos', titulo: 'Caso por caso', icono: 'escudo' },
  { id: 'vigias', titulo: 'Vigías que actuaron', icono: 'pulso' },
];

/** El desenlace decide el color, y el color quiere decir lo mismo en las dos pantallas. */
function tonoDeResultado(resultado: string): Tono {
  if (resultado === 'resuelto') return 'local';
  if (resultado === 'escalado_humano') return 'esc';
  if (resultado === 'bloqueado') return 'veto';
  return 'gris';
}

function tonoDeDestino(destino: string): Tono {
  if (destino === 'local') return 'local';
  if (destino === 'nube') return 'nube';
  return 'gris';
}

const DESENLACES: readonly { readonly clave: string; readonly tono: Tono }[] = [
  { clave: 'resuelto', tono: 'local' },
  { clave: 'escalado_humano', tono: 'esc' },
  { clave: 'bloqueado', tono: 'veto' },
  { clave: 'descartado', tono: 'gris' },
];

function Kpis({ m }: { m: ResumenDeModo }): React.JSX.Element {
  const costo = dinero(m.costo_por_resuelto, m.costo_provisional);

  return (
    <section className="grid kpis" id="resumen" aria-label="Resumen del modo corrido">
      <Cifra
        destacada
        titulo={`Costo por caso resuelto · modo ${m.modo}`}
        valor={costo}
        ausencia={esAusencia(costo)}
        nota={
          m.costo_provisional
            ? 'La máquina de referencia no está caracterizada. Con tarifa horaria cero el costo saldría $0.0000, que se lee como «gratis» y no lo es. La cifra llega cuando la máquina se mida, no antes.'
            : `Costo total de la corrida: $${m.costo_total.toFixed(4)}`
        }
      />
      <Cifra
        titulo="Acierto contra el esperado"
        valor={pctDe(m.aciertos, m.casos)}
        ausencia={esAusencia(pctDe(m.aciertos, m.casos))}
        nota={`${entero(m.aciertos)} de ${entero(m.casos)} casos del lote`}
      />
      <Cifra
        titulo="Latencia media"
        valor={segundos(m.latencia_media_ms)}
        nota={`p95 en ${segundos(m.latencia_p95_ms)}`}
      />
      <Cifra
        titulo="Escalados a una persona"
        valor={entero(m.escalados)}
        nota={`${entero(m.sin_sustento)} de ellos por falta de sustento verificado`}
      />
    </section>
  );
}

/**
 * Casos por categoría, repartidos por desenlace.
 *
 * Las categorías son las del lote escrito a mano: huecos deliberados, intentos de
 * sacar datos de otro contacto, inyecciones. Verlas por separado es lo que
 * distingue «el agente falla» de «el agente se niega donde tiene que negarse»,
 * que en un promedio único quedan indistinguibles.
 */
function CategoriasYDesenlaces({
  casos,
  m,
}: {
  casos: readonly CasoReproducido[];
  m: ResumenDeModo;
}): React.JSX.Element {
  const categorias = [...new Set(casos.map((c) => c.categoria))].sort();

  const columnas: readonly Columna[] = categorias.map((categoria) => ({
    etiqueta: categoria,
    segmentos: DESENLACES.map((d) => ({
      clave: d.clave,
      valor: casos.filter((c) => c.categoria === categoria && c.resultado === d.clave).length,
      tono: d.tono,
    })),
  }));

  // Los desenlaces salen del resumen del modo, no de recontar `casos`: recontar
  // aquí daría un segundo sitio donde se decide qué es un escalado, y el día que
  // los dos discreparan nadie sabría cuál mirar. Es el mismo defecto que la
  // fase 6 arregló en la proyección.
  const desenlaces: readonly Parte[] = [
    { etiqueta: 'Resueltos', casos: m.resueltos, tono: 'local' },
    { etiqueta: 'Escalados a una persona', casos: m.escalados, tono: 'esc' },
    { etiqueta: 'Bloqueados', casos: m.bloqueados, tono: 'veto' },
    { etiqueta: 'Descartados', casos: m.descartados, tono: 'gris' },
  ];

  return (
    <section className="grid row2">
      <Tarjeta
        id="categorias"
        titulo="Casos por categoría"
        pista="Cada columna es una categoría del lote. La altura es cuántos casos; el color, cómo acabaron."
        extra={
          <Leyenda
            series={[
              { clave: 'Resuelto', tono: 'local' },
              { clave: 'Escalado', tono: 'esc' },
              { clave: 'Bloqueado', tono: 'veto' },
              { clave: 'Descartado', tono: 'gris' },
            ]}
          />
        }
      >
        <BarrasApiladas columnas={columnas} />
      </Tarjeta>

      <Tarjeta
        id="perimetro"
        titulo="Desenlaces"
        pista={`Sobre ${entero(m.casos)} casos del modo ${m.modo}`}
      >
        <Partes partes={desenlaces} total={m.casos} />
        <p className="note">
          Perímetro: <b>{entero(m.perimetro.retenidos)}</b> de{' '}
          <b>{entero(m.perimetro.altos)}</b> casos de sensibilidad alta retenidos,{' '}
          <b>{entero(m.perimetro.escapados)}</b> escapados. El denominador va con el número: sin
          casos de sensibilidad alta, «0 escapados» no afirma nada.
        </p>
      </Tarjeta>
    </section>
  );
}

function Modos({ modos }: { modos: readonly ResumenDeModo[] }): React.JSX.Element {
  return (
    <section className="grid row1">
      <Tarjeta
        id="modos"
        titulo="Los tres modos, sobre la misma carga"
        pista="Un modo que no se corrió conserva su fila con el motivo. Esconderlo daría una comparación que parece completa cuando le falta la mitad."
      >
        <div className="tablewrap">
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
              {modos.map((m) =>
                m.corrido ? (
                  <tr key={m.modo}>
                    <td>
                      <Etiqueta texto={m.modo} tono={tonoDeDestino(m.modo)} />
                    </td>
                    <td className="mono">{entero(m.casos)}</td>
                    <td className="mono">
                      {entero(m.aciertos)} · {pctDe(m.aciertos, m.casos)}
                    </td>
                    <td className="mono">{entero(m.escalados)}</td>
                    <td className="mono">{entero(m.sin_sustento)}</td>
                    <td className="mono">{segundos(m.latencia_media_ms)}</td>
                    {/* PROVISIONAL y no «$0.0000»: con la máquina de referencia sin
                        caracterizar, cero se lee como «gratis» y es falso (R-031). */}
                    <td className="mono">{dinero(m.costo_por_resuelto, m.costo_provisional)}</td>
                  </tr>
                ) : (
                  <tr key={m.modo}>
                    <td>
                      <Etiqueta texto={m.modo} tono="gris" />
                    </td>
                    <td colSpan={6} style={{ textAlign: 'left', color: 'var(--tenue)' }}>
                      <b>NO CORRIDO</b> — {m.motivo ?? 'sin motivo registrado'}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </section>
  );
}

function Caso({ caso }: { caso: CasoReproducido }): React.JSX.Element {
  return (
    <tr className={caso.clase_sensibilidad === 'alta' ? 'alta' : ''}>
      <td className="mono">{caso.caso_id}</td>
      <td>{caso.pregunta}</td>
      <td className="mono">{caso.categoria}</td>
      <td>
        <Etiqueta texto={caso.resultado} tono={tonoDeResultado(caso.resultado)} />
      </td>
      <td>
        <Etiqueta texto={caso.destino_ejecucion} tono={tonoDeDestino(caso.destino_ejecucion)} />
      </td>
      <td>
        <SiNo si={caso.hubo_egreso} titulo={caso.hubo_egreso ? 'hubo egreso' : 'sin egreso'} />
      </td>
      <td className="mono">{entero(caso.fuentes.length)}</td>
      <td className="mono">{caso.vigias_que_actuaron.join(', ') || '—'}</td>
      <td>
        {caso.acerto ? (
          <SiNo si titulo="acertó lo esperado" />
        ) : (
          <span className="mono" title={caso.por_que_no ?? ''}>
            {caso.por_que_no ?? 'no acertó'}
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * Los vigías, contados sobre lo que quedó grabado.
 *
 * No es el estado en vivo de los once vigías —esta pantalla no habla con el
 * perímetro y no puede saberlo—: es cuántas veces actuó cada uno durante la
 * corrida. La distinción está escrita en la pista de la tarjeta, porque un
 * semáforo verde que en realidad quiere decir «no me consta» es peor que no
 * enseñar nada.
 */
function Vigias({ casos }: { casos: readonly CasoReproducido[] }): React.JSX.Element {
  const cuenta = (valores: readonly string[]): ReadonlyMap<string, number> => {
    const mapa = new Map<string, number>();
    for (const v of valores) mapa.set(v, (mapa.get(v) ?? 0) + 1);
    return mapa;
  };

  const vigias = cuenta(casos.flatMap((c) => c.vigias_que_actuaron));
  const incidentes = cuenta(casos.flatMap((c) => c.incidentes));

  const renglones: readonly Renglon[] = [
    ...[...vigias].map(([nombre, n]) => ({
      nombre,
      detalle: `actuó en ${entero(n)} de ${entero(casos.length)} casos`,
      alerta: false,
      marca: 'vigía',
    })),
    ...[...incidentes].map(([nombre, n]) => ({
      nombre,
      detalle: `${entero(n)} incidente(s) registrado(s), uno a uno`,
      alerta: true,
      marca: 'incidente',
    })),
  ];

  return (
    <Tarjeta
      id="vigias"
      titulo="Vigías que actuaron"
      pista="Cuántas veces actuó cada uno durante esta corrida. No es el estado en vivo: esta pantalla no habla con el perímetro."
    >
      <Lista renglones={renglones} />
    </Tarjeta>
  );
}

export function Reproduccion({ fuente }: { fuente: FuenteDeReproduccion }): React.JSX.Element {
  const { datos, casos } = fuente;
  const corridos = datos.modos.filter((m) => m.corrido);

  return (
    <div className="app">
      <Rail secciones={SECCIONES} />

      <main className="main">
        <Cabecera
          titulo="Demo pública"
          sub={`Lote ${datos.lote} · publicado el ${fechaHora(datos.generado_en)}`}
          marca={
            <>
              <i className="dot" aria-hidden="true" />
              {entero(casos.length)} casos reproducidos
            </>
          }
        />

        {fuente.es_reproduccion && (
          <div className="banda-demo" role="alert">
            <strong>Reproducción · lote {datos.lote}</strong>
            <span>{datos.aviso}</span>
          </div>
        )}

        {corridos.map((m) => (
          <div key={m.modo}>
            <Kpis m={m} />
            <CategoriasYDesenlaces casos={casos.filter((c) => c.modo === m.modo)} m={m} />
          </div>
        ))}

        {corridos.length === 0 && (
          <p className="vacio">
            Ningún modo se corrió en este lote. No hay cifras que enseñar y no se dibujan ceros: la
            tabla de abajo dice, modo por modo, qué faltó para poder correrlo.
          </p>
        )}

        <Modos modos={datos.modos} />

        <section className="grid row2">
          <Tarjeta
            id="casos"
            titulo="Caso por caso"
            pista={`${entero(casos.length)} caso(s) reproducidos. Los de sensibilidad alta van marcados: son los que nunca salieron del perímetro.`}
          >
            <div className="tablewrap alto">
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
                  {/* La clave lleva la posición y no solo el identificador: el
                      lote de la fase 7 tiene hoy dos casos con el mismo `id`
                      (`lote:v1:001`), y aquí una fila es «el n-ésimo resultado
                      registrado», que sí es único. Deduplicar por identificador
                      escondería el defecto en vez de enseñarlo — el arreglo va en
                      el lote, no en la pantalla que lo reproduce. */}
                  {casos.map((c, i) => (
                    <Caso key={`${c.modo}:${c.caso_id}:${String(i)}`} caso={c} />
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>

          <Vigias casos={casos} />
        </section>

        <Pie>
          Nada de esta pantalla se ejecuta al visitarla. Son ejecuciones registradas del lote{' '}
          <b>{datos.lote}</b>, servidas desde la proyección: ninguna llamada a un modelo, ningún
          presupuesto consumido por visitante y ninguna dependencia de que el perímetro esté
          encendido. Origen: <code>{fuente.origen}</code>.
        </Pie>
      </main>
    </div>
  );
}
