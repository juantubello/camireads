// rating.ts
//
// Helpers puros para la calificación en cuartos de estrella (Fase 9).
//
// Reglas del contrato con el backend:
// - 0 = "sin calificar" (hay ~700 libros así, que vienen del import viejo).
// - Calificado = 0.25..5 en pasos de 0.25.
// - El backend devuelve `3.75`, `4` o `4.00` indistintamente: acá se normaliza
//   todo a number para que el resto del front no tenga que pensarlo.

/** Paso mínimo de la calificación: un cuarto de estrella. */
export const RATING_STEP = 0.25
/** Mínimo de una calificación real (0 queda reservado para "sin calificar"). */
export const RATING_MIN = RATING_STEP
export const RATING_MAX = 5

/** Lleva cualquier número al rango 0..5. NaN/Infinity cuentan como 0. */
export function clampRating(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(RATING_MAX, Math.max(0, value))
}

/**
 * Redondea al cuarto MÁS CERCANO (para normalizar lo que llega del backend o
 * de un borrador viejo). Ojo: el gesto de tocar/deslizar usa `ceilToQuarter`,
 * no esto — ahí queremos "hasta donde llega el dedo".
 */
export function snapToQuarter(value: number): number {
  return clampRating(Math.round(clampRating(value) / RATING_STEP) * RATING_STEP)
}

/**
 * Cuarto hacia ARRIBA, con mínimo 0.25. Lo usa el gesto: si el dedo está
 * apenas pasado el borde de la tercera estrella, la tercera ya empieza a
 * llenarse (3.25), como en StoryGraph. Nunca devuelve 0: tocar las estrellas
 * siempre califica; para "sin calificar" está el botón de borrar.
 */
export function ceilToQuarter(value: number): number {
  // El epsilon evita que 3.0000000001 (error de punto flotante) salte a 3.25.
  const steps = Math.ceil(clampRating(value) / RATING_STEP - 1e-9)
  return Math.min(RATING_MAX, Math.max(RATING_MIN, steps * RATING_STEP))
}

/**
 * Normaliza lo que manda la API (`3.75`, `4`, `"4.00"`, null) a un number en
 * cuartos. Lo que no se puede leer cae en 0 = sin calificar, que es lo más
 * honesto: mejor "sin calificar" que inventar estrellas.
 */
export function parseRating(raw: unknown): number {
  const value = typeof raw === 'string' ? Number(raw) : raw
  return typeof value === 'number' ? snapToQuarter(value) : 0
}

/** Siempre 2 decimales y con punto: "3.50", "4.00" (pedido explícito de Camila). */
export function formatRating(rating: number): string {
  return snapToQuarter(rating).toFixed(2)
}

/**
 * Promedio de calificaciones (ej. /stats): 2 decimales con punto, igual que
 * `formatRating`, pero SIN redondear a cuartos — un promedio de 3.87 es 3.87.
 */
export function formatRatingAverage(average: number): string {
  return clampRating(average).toFixed(2)
}

/** true si tiene calificación (0 = sin calificar). */
export function isRated(rating: number | null | undefined): rating is number {
  return typeof rating === 'number' && rating > 0
}

/** Texto para lectores de pantalla: "3.75 de 5 estrellas" o "Sin calificar". */
export function ratingLabel(rating: number): string {
  return isRated(rating) ? `${formatRating(rating)} de 5 estrellas` : 'Sin calificar'
}
