// Las piezas de la maqueta, como componentes.
//
// Todas comparten una propiedad y no es de estilo: **ninguna acepta un número
// suelto que ella misma decida cómo dibujar.** Las barras reciben valores y un
// total; los porcentajes se calculan de ahí y no de una altura escrita a mano.
// Una barra con la altura puesta a ojo es una cifra inventada con otra forma, y
// es la clase de cifra inventada que ningún check del repositorio vería.
//
// De ahí también la regla del total cero: cuando no hay observaciones, estas
// piezas dibujan la pista vacía y lo dicen. No reparten el 100 % entre categorías
// que no ocurrieron.
//
// Iconos: SVG en línea, heredando `currentColor`. Ni un emoji. Un emoji cambia de
// dibujo según el sistema operativo del que mira, y en una pantalla donde el
// color verde quiere decir «retenido» eso no es un detalle tipográfico.

import { useEffect, useState } from 'react';

/* ── Iconos ───────────────────────────────────────────────────────────────── */

export type NombreDeIcono =
  | 'cuadros'
  | 'nodos'
  | 'escudo'
  | 'pulso'
  | 'moneda'
  | 'si'
  | 'no'
  | 'sol'
  | 'luna';

const TRAZOS: Record<NombreDeIcono, React.JSX.Element> = {
  cuadros: (
    <>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </>
  ),
  nodos: (
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="12" r="2.4" />
      <path d="M8.4 6h3.1a3 3 0 0 1 3 3v0M8.4 18h3.1a3 3 0 0 0 3-3v0" />
    </>
  ),
  escudo: <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />,
  pulso: <path d="M3 12h4l2.5-6 5 12L17 12h4" />,
  // La «S» del signo de dólar: el arco de arriba abre a la izquierda y el de
  // abajo a la derecha. Invertir los flags de barrido da una S al revés que a
  // primera vista pasa por buena — de ahí que los dos semicírculos sean exactos
  // (radio 3.5, distancia 7) en vez de arcos a ojo.
  moneda: (
    <>
      <path d="M12 2.5v19" />
      <path d="M17 5.5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6.5" />
    </>
  ),
  si: <path d="M4 12.5l5 5L20 6.5" />,
  no: <path d="M6 6l12 12M18 6L6 18" />,
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
    </>
  ),
  luna: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />,
};

export function Icono({
  nombre,
  titulo,
}: {
  nombre: NombreDeIcono;
  titulo?: string;
}): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" role={titulo === undefined ? 'presentation' : 'img'} aria-hidden={titulo === undefined}>
      {titulo !== undefined && <title>{titulo}</title>}
      {TRAZOS[nombre]}
    </svg>
  );
}

/* ── Barra lateral ────────────────────────────────────────────────────────── */

export type Seccion = {
  readonly id: string;
  readonly titulo: string;
  readonly icono: NombreDeIcono;
};

/**
 * La barra lateral.
 *
 * Cada icono apunta a una sección que existe en esta pantalla. No hay entradas
 * a vistas que no están construidas: una navegación con destinos muertos es una
 * promesa de producto, y este panel no hace promesas — enseña lo que hay.
 */
export function Rail({ secciones }: { secciones: readonly Seccion[] }): React.JSX.Element {
  const [activa, setActiva] = useState<string>(secciones[0]?.id ?? '');

  return (
    <nav className="rail" aria-label="Secciones del panel">
      <div className="logo" aria-hidden="true">
        P
      </div>
      {secciones.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          title={s.titulo}
          aria-label={s.titulo}
          aria-current={s.id === activa ? 'true' : undefined}
          onClick={() => {
            setActiva(s.id);
          }}
        >
          <Icono nombre={s.icono} />
        </a>
      ))}
    </nav>
  );
}

/* ── Claro y oscuro ───────────────────────────────────────────────────────── */

const CLAVE_TEMA = 'perimetro:tema';

/**
 * El interruptor de tema.
 *
 * Arranca en claro y **no consulta al sistema operativo**. Es deliberado: en esta
 * pantalla el color quiere decir algo —verde retenido, rojo egreso, ámbar
 * escalado— y la maqueta está calibrada en claro. Dejar que el sistema eligiera
 * el contraste sería dejarle elegir cuánto se ve una alarma. Quien quiera oscuro
 * lo pide aquí, y esa elección se recuerda.
 *
 * Lo único que hace es poner `data-tema` en el elemento raíz. Toda la paleta
 * cuelga de ese atributo en `estilo.css`; no hay ni un color decidido en JS.
 */
export function InterruptorDeTema(): React.JSX.Element {
  const [oscuro, setOscuro] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(CLAVE_TEMA) === 'oscuro';
    } catch {
      // Almacenamiento bloqueado (modo privado, cookies de terceros). El panel
      // se ve igual, solo que sin recordar la elección entre visitas.
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.dataset['tema'] = oscuro ? 'oscuro' : 'claro';
    try {
      window.localStorage.setItem(CLAVE_TEMA, oscuro ? 'oscuro' : 'claro');
    } catch {
      /* sin memoria entre visitas, y ya está */
    }
  }, [oscuro]);

  return (
    <button
      type="button"
      className="tema"
      role="switch"
      aria-checked={oscuro}
      aria-label={oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => {
        setOscuro((v) => !v);
      }}
    >
      <span className="perilla" aria-hidden="true">
        <Icono nombre={oscuro ? 'luna' : 'sol'} />
      </span>
      <span className="m">{oscuro ? 'Dark mode' : 'Light mode'}</span>
    </button>
  );
}

/* ── Barra superior ───────────────────────────────────────────────────────── */

export function Cabecera({
  titulo,
  sub,
  marca,
}: {
  titulo: string;
  sub: React.ReactNode;
  /** Lo que va en la píldora de la derecha. Un dato, no un adorno. */
  marca: React.ReactNode;
}): React.JSX.Element {
  return (
    <header className="top">
      <div>
        <h1 className="d">{titulo}</h1>
        <div className="sub">{sub}</div>
      </div>
      <div className="spacer" />
      <span className="pill">{marca}</span>
      <InterruptorDeTema />
    </header>
  );
}

/* ── Tarjeta ──────────────────────────────────────────────────────────────── */

export function Tarjeta({
  id,
  titulo,
  pista,
  extra,
  className,
  children,
}: {
  id?: string;
  titulo: string;
  pista?: React.ReactNode;
  /** Esquina superior derecha: leyenda del gráfico, casi siempre. */
  extra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <article className={className === undefined ? 'card' : `card ${className}`} id={id}>
      <div className="card-head">
        <div>
          <h2>{titulo}</h2>
          {pista !== undefined && <div className="hint">{pista}</div>}
        </div>
        {extra}
      </div>
      {children}
    </article>
  );
}

/* ── Cifra ────────────────────────────────────────────────────────────────── */

/**
 * Un KPI.
 *
 * `valor` llega ya formateado —desde `formato.ts`— y el componente mira si es una
 * ausencia para pintarlo distinto. Un «PROVISIONAL» con el cuerpo de tres
 * centímetros de una cifra se lee como una cifra; con este tamaño y este color se
 * lee como lo que es.
 */
export function Cifra({
  titulo,
  valor,
  nota,
  ausencia = false,
  destacada = false,
}: {
  titulo: string;
  valor: string;
  nota?: React.ReactNode;
  ausencia?: boolean;
  destacada?: boolean;
}): React.JSX.Element {
  return (
    <article className={destacada ? 'card kpi lead' : 'card kpi'}>
      <div>
        <div className="label">{titulo}</div>
        <div className={ausencia ? 'val d sin-cifra' : 'val d'}>{valor}</div>
      </div>
      {nota !== undefined && <div className="delta">{nota}</div>}
    </article>
  );
}

/* ── Series y colores ─────────────────────────────────────────────────────── */

/** Los cinco tonos del panel. El color significa algo; no se elige por gusto. */
export type Tono = 'local' | 'nube' | 'esc' | 'veto' | 'gris';

const VARIABLE: Record<Tono, string> = {
  local: 'var(--local)',
  nube: 'var(--nube)',
  esc: 'var(--esc)',
  veto: 'var(--alarma)',
  gris: 'var(--gris)',
};

export function colorDe(tono: Tono): string {
  return VARIABLE[tono];
}

export function Etiqueta({ texto, tono }: { texto: string; tono: Tono }): React.JSX.Element {
  return <span className={`tag t-${tono}`}>{texto}</span>;
}

export function Leyenda({
  series,
}: {
  series: readonly { readonly clave: string; readonly tono: Tono }[];
}): React.JSX.Element {
  return (
    <div className="legend">
      {series.map((s) => (
        <span key={s.clave}>
          <i style={{ background: colorDe(s.tono) }} />
          {s.clave}
        </span>
      ))}
    </div>
  );
}

/* ── Barras apiladas ──────────────────────────────────────────────────────── */

export type Segmento = { readonly clave: string; readonly valor: number; readonly tono: Tono };
export type Columna = { readonly etiqueta: string; readonly segmentos: readonly Segmento[] };

/**
 * Columnas apiladas.
 *
 * La altura de cada segmento es su valor sobre el **máximo de las columnas**, no
 * sobre el total de su propia columna: así la altura sigue queriendo decir
 * volumen y no proporción, que es lo que hace comparables dos columnas.
 */
export function BarrasApiladas({ columnas }: { columnas: readonly Columna[] }): React.JSX.Element {
  const totales = columnas.map((c) => c.segmentos.reduce((s, g) => s + g.valor, 0));
  const maximo = Math.max(...totales, 0);

  if (maximo === 0) {
    return (
      <p className="hint">
        Ninguna observación en esta ventana. No se dibuja nada: una barra a cero repartida entre
        categorías que no ocurrieron parece una medida.
      </p>
    );
  }

  return (
    <>
      <div
        className="chart"
        role="img"
        aria-label={columnas
          .map(
            (c, i) =>
              `${c.etiqueta}: ${String(totales[i] ?? 0)} — ` +
              c.segmentos.map((g) => `${g.clave} ${String(g.valor)}`).join(', '),
          )
          .join(' · ')}
      >
        {columnas.map((c) => (
          <div className="col" key={c.etiqueta}>
            {c.segmentos.map((g) => (
              <span
                key={g.clave}
                className={`s-${g.tono}`}
                style={{ height: `${String((g.valor / maximo) * 100)}%` }}
                title={`${c.etiqueta} · ${g.clave}: ${String(g.valor)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="xaxis" aria-hidden="true">
        {columnas.map((c) => (
          <span key={c.etiqueta} title={c.etiqueta}>
            {c.etiqueta}
          </span>
        ))}
      </div>
    </>
  );
}

/* ── Reparto ──────────────────────────────────────────────────────────────── */

export type Parte = {
  readonly etiqueta: string;
  readonly casos: number;
  readonly tono: Tono;
  /** Lo que se lee a la derecha del nombre. Ya formateado. */
  readonly detalle?: string;
};

/**
 * Barras de reparto sobre un total explícito.
 *
 * `total` es un argumento y no la suma de las partes, a propósito: el que dibuja
 * tiene que decir contra qué denominador está repartiendo. Sumarlo aquí haría que
 * cualquier subconjunto se enseñara como si fuera el todo.
 */
export function Partes({
  partes,
  total,
}: {
  partes: readonly Parte[];
  total: number;
}): React.JSX.Element {
  return (
    <div className="split">
      {partes.map((p) => (
        <div key={p.etiqueta}>
          <div className="lbl">
            <b>{p.etiqueta}</b>
            <span>
              {p.casos.toLocaleString('es')}
              {total === 0 ? '' : ` · ${((p.casos / total) * 100).toFixed(1)} %`}
              {p.detalle === undefined ? '' : ` · ${p.detalle}`}
            </span>
          </div>
          <div className="track">
            <i
              style={{
                width: total === 0 ? '0%' : `${String((p.casos / total) * 100)}%`,
                background: colorDe(p.tono),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Lista de estado ──────────────────────────────────────────────────────── */

export type Renglon = {
  readonly nombre: string;
  readonly detalle: string;
  readonly alerta: boolean;
  /** La etiqueta de la derecha. En la maqueta es la autoridad del vigía. */
  readonly marca: string;
};

export function Lista({ renglones }: { renglones: readonly Renglon[] }): React.JSX.Element {
  if (renglones.length === 0) {
    return <p className="hint">Nada que enseñar aquí en esta ventana.</p>;
  }

  return (
    <ul className="watch">
      {renglones.map((r) => (
        <li key={r.nombre}>
          <i className={r.alerta ? 'state warn' : 'state ok'} aria-hidden="true" />
          <span className="nm">
            <b>{r.nombre}</b>
            <span>{r.detalle}</span>
          </span>
          <span className="auth">{r.marca}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Pie ──────────────────────────────────────────────────────────────────── */

export function Pie({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="budget">
      <div className="txt">{children}</div>
    </div>
  );
}

/* ── Sí / no, con icono ───────────────────────────────────────────────────── */

export function SiNo({ si, titulo }: { si: boolean; titulo: string }): React.JSX.Element {
  return (
    <span
      className={si ? 'tag t-local' : 'tag t-gris'}
      style={{ padding: '2.5px 5px' }}
      title={titulo}
    >
      <svg
        viewBox="0 0 24 24"
        width="11"
        height="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
      >
        <title>{titulo}</title>
        {si ? TRAZOS.si : TRAZOS.no}
      </svg>
    </span>
  );
}
