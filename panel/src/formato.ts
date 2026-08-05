// Cómo se escribe una cifra en el panel, y cómo se escribe su ausencia.
//
// Un solo sitio, porque las dos pantallas —operación y reproducción— tienen que
// decir lo mismo con las mismas palabras. Si la de operación enseñara `0 %`
// donde la de la demo enseña `—`, alguien compararía las dos y sacaría una
// conclusión sobre el sistema que en realidad es sobre el formateo.
//
// La regla que gobierna este archivo: **`null` no es cero.** `null` es «no hay
// denominador», «no se midió», «no se puede afirmar». Pintarlo como `0 %` o como
// `$0.0000` convierte una ausencia de observación en una afirmación, que es
// exactamente lo que la lista de prohibido del manual llama cifra inventada.

/** Una fracción de 0 a 1 como porcentaje, o `—` si no hay nada que afirmar. */
export function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)} %`;
}

/** Una proporción con su denominador a la vista. Denominador cero devuelve `—`. */
export function pctDe(parte: number, total: number): string {
  return total === 0 ? '—' : pct(parte / total);
}

/** Milisegundos como segundos. Postgres devuelve los agregados como texto. */
export function segundos(v: string | number | null): string {
  if (v === null) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? `${(n / 1000).toFixed(1)} s` : '—';
}

/**
 * Una cifra de dinero, o por qué no hay cifra.
 *
 * `provisional` gana sobre el valor y no es un adorno: con la máquina de
 * referencia sin caracterizar, el costo por caso sale `$0.0000`, que se lee como
 * «gratis» y es falso (R-031). `config/maquina-referencia.json` lo prohíbe por
 * escrito, y por eso la marca viaja en el mismo argumento que el número.
 */
export function dinero(v: number | null, provisional: boolean): string {
  if (provisional) return 'PROVISIONAL';
  return v === null ? '—' : `$${v.toFixed(4)}`;
}

/** Cierto si lo que devolvió un formateador no es una cifra, sino su ausencia. */
export function esAusencia(texto: string): boolean {
  return texto === '—' || texto === 'PROVISIONAL';
}

export function entero(v: number): string {
  return v.toLocaleString('es');
}

/** Una marca de tiempo ISO, legible y sin fingir precisión que no importa. */
export function fecha(iso: string): string {
  return iso.slice(0, 10);
}

export function fechaHora(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}
