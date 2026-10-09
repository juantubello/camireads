// sagas.ts — cliente de "Mis sagas" (Fase 10).
//
// Una saga es un agrupador con nombre, imagen opcional y ORDEN MANUAL de sus
// libros (el que Camila quiera, no el de lectura). Un libro puede estar en
// varias sagas, y borrar una saga no borra libros.
//
// Contrato:
//   GET    /sagas                       -> SagaSummary[]
//   POST   /sagas                       <- {name, urlCover?, coverDataUrl?} -> SagaDetail (409 nombre repetido)
//   PUT    /sagas/{id}                  <- {name?, urlCover?, coverDataUrl?, clearCover?} -> SagaDetail
//   DELETE /sagas/{id}                  -> 204
//   GET    /sagas/{id}                  -> SagaDetail
//   POST   /sagas/{id}/books            <- {bookId} -> SagaDetail (al final; 409 si ya estaba)
//   DELETE /sagas/{id}/books/{bookId}   -> SagaDetail (renumera)
//   PUT    /sagas/{id}/order            <- {bookIds} (permutación completa) -> SagaDetail
//   GET    /books/{bookId}/sagas        -> BookSaga[]
//
// Armado automático (Fase 10b): sagas detectadas del título de Goodreads
// "Libro (Saga, #N)". Re-ejecutarlo es seguro: el backend no recrea sagas
// borradas, no re-agrega libros quitados y reconoce sagas renombradas.
//   GET    /sagas/auto/preview          -> AutoSagaPreview
//   POST   /sagas/auto/apply            -> AutoSagaApplyResult (una transacción)
//   GET    /sagas/auto/undo-preview     -> {count}
//   POST   /sagas/auto/undo             -> {deleted} (solo automáticas no editadas)
//   POST   /sagas/{targetId}/merge      <- {fromSagaId} -> SagaDetail (400 si es la misma)
//
// Los errores (400/404/409) traen un `message` legible: se muestra tal cual.

import { API_BASE_URL, getApiHeaders, readApiError } from '@/lib/api-config'
import { resizeImageFile, type ResizeResult } from '@/lib/image-resize'
import { parseRating } from '@/lib/rating'

export interface SagaSummary {
  id: number
  name: string
  urlCover: string | null
  coverDataUrl: string | null
  bookCount: number
  /** Hasta 4 tapas de los primeros libros, en orden (para el collage). */
  previewCovers: string[]
  updatedAt: string | null
  /**
   * true = la creó el armado automático y Camila todavía no la tocó. Es lo que
   * "Deshacer el armado" puede borrar; en cuanto la edita, pasa a ser suya.
   */
  autoDetected: boolean
}

export interface SagaBook {
  position: number
  bookId: number
  title: string
  author: string
  urlCover: string | null
  /** Decimal en cuartos; 0 = sin calificar o sin reseña. */
  rating: number
  endReadDate: string | null
}

export interface SagaDetail extends SagaSummary {
  books: SagaBook[]
}

export interface BookSaga {
  id: number
  name: string
  position: number
  bookCount: number
}

/* ------------------------------------------------------------------ */
/* Imagen                                                              */
/* ------------------------------------------------------------------ */

/** Lado mayor de la imagen de una saga. Suficiente para la cabecera a 2x. */
export const SAGA_COVER_SIZE = 600
const SAGA_COVER_QUALITY = 0.82
/**
 * El backend rechaza más de 400.000 caracteres de base64 (~293 KB). Apuntamos
 * a 220 KB decodificados (~293.000 caracteres) para quedar lejos del borde:
 * un 400 a mitad de camino es peor que una imagen un poco más comprimida.
 * En la práctica una tapa de 600px en WebP/JPEG pesa 40–120 KB.
 */
export const SAGA_COVER_MAX_BYTES = 220 * 1024

/**
 * Achica la foto elegida antes de mandarla. Sin recorte: una imagen de saga
 * suele ser una tapa o un banner, y recortarla al cuadrado se come el título.
 */
export function resizeSagaCover(file: File): Promise<ResizeResult> {
  return resizeImageFile(file, {
    fit: 'contain',
    size: SAGA_COVER_SIZE,
    quality: SAGA_COVER_QUALITY,
    maxBytes: SAGA_COVER_MAX_BYTES,
  })
}

/** La imagen propia de la saga: la foto subida gana sobre el link. */
export function sagaCoverSrc(
  saga: Pick<SagaSummary, 'coverDataUrl' | 'urlCover'>,
): string | null {
  return saga.coverDataUrl ?? saga.urlCover ?? null
}

/**
 * Tapa de un libro tal como la manda la API de sagas. Normalmente es un link o
 * un data URL; si llegara el base64 pelado (como `b64Cover` en `/reviews`), se
 * le pone el prefijo igual que hace la ficha del libro.
 */
export function bookCoverSrc(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value) return null
  if (/^(https?:|data:|blob:|\/)/i.test(value)) return value
  return `data:image/png;base64,${value}`
}

/**
 * Mismo criterio que el backend para "nombre repetido": sin acentos, sin
 * mayúsculas, espacios colapsados. Sirve para avisar ANTES de mandar.
 */
export function normalizeSagaName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** "1 libro" / "3 libros" / "Sin libros". */
export function bookCountLabel(count: number): string {
  if (count === 0) return 'Sin libros'
  return `${count} ${count === 1 ? 'libro' : 'libros'}`
}

/* ------------------------------------------------------------------ */
/* Normalización                                                       */
/* ------------------------------------------------------------------ */

// La API es nueva: normalizamos lo que llegue para que un null o un rating
// "4.00" en string no rompan la UI.
function toSummary(raw: Partial<SagaSummary> & { id: number }): SagaSummary {
  return {
    id: raw.id,
    name: raw.name ?? '',
    urlCover: raw.urlCover || null,
    coverDataUrl: raw.coverDataUrl || null,
    bookCount: raw.bookCount ?? 0,
    previewCovers: (raw.previewCovers ?? []).filter(Boolean),
    updatedAt: raw.updatedAt ?? null,
    autoDetected: raw.autoDetected === true,
  }
}

function toDetail(raw: Partial<SagaDetail> & { id: number }): SagaDetail {
  const books = (raw.books ?? []).map((b) => ({
    position: b.position,
    bookId: b.bookId,
    title: b.title ?? '',
    author: b.author ?? '',
    urlCover: b.urlCover || null,
    rating: parseRating(b.rating),
    endReadDate: b.endReadDate ?? null,
  }))
  return {
    ...toSummary(raw),
    bookCount: raw.bookCount ?? books.length,
    books,
  }
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown },
  fallback: string,
): Promise<T> {
  const baseUrl = await API_BASE_URL
  const { json, headers, ...rest } = init
  const response = await fetch(`${baseUrl}${path}`, {
    ...rest,
    headers: getApiHeaders(
      json === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    ),
    body: json === undefined ? rest.body : JSON.stringify(json),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, fallback))
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export async function fetchSagas(signal?: AbortSignal): Promise<SagaSummary[]> {
  const data = await request<SagaSummary[]>('/sagas', { signal }, 'No pude traer tus sagas.')
  return (data ?? []).map(toSummary)
}

export async function fetchSaga(id: number | string, signal?: AbortSignal): Promise<SagaDetail> {
  const data = await request<SagaDetail>(`/sagas/${id}`, { signal }, 'No pude traer la saga.')
  return toDetail(data)
}

export async function createSaga(input: {
  name: string
  urlCover?: string
  coverDataUrl?: string
}): Promise<SagaDetail> {
  const data = await request<SagaDetail>(
    '/sagas',
    { method: 'POST', json: input },
    'No pude crear la saga.',
  )
  return toDetail(data)
}

/** Parcial: lo que no viene no se toca. `clearCover: true` borra la imagen. */
export async function updateSaga(
  id: number,
  changes: { name?: string; urlCover?: string; coverDataUrl?: string; clearCover?: boolean },
): Promise<SagaDetail> {
  const data = await request<SagaDetail>(
    `/sagas/${id}`,
    { method: 'PUT', json: changes },
    'No pude guardar la saga.',
  )
  return toDetail(data)
}

export async function deleteSaga(id: number): Promise<void> {
  await request<void>(`/sagas/${id}`, { method: 'DELETE' }, 'No pude borrar la saga.')
}

export async function addBookToSaga(sagaId: number, bookId: number): Promise<SagaDetail> {
  const data = await request<SagaDetail>(
    `/sagas/${sagaId}/books`,
    { method: 'POST', json: { bookId } },
    'No pude agregar el libro a la saga.',
  )
  return toDetail(data)
}

export async function removeBookFromSaga(sagaId: number, bookId: number): Promise<SagaDetail> {
  const data = await request<SagaDetail>(
    `/sagas/${sagaId}/books/${bookId}`,
    { method: 'DELETE' },
    'No pude sacar el libro de la saga.',
  )
  return toDetail(data)
}

export async function reorderSaga(sagaId: number, bookIds: number[]): Promise<SagaDetail> {
  const data = await request<SagaDetail>(
    `/sagas/${sagaId}/order`,
    { method: 'PUT', json: { bookIds } },
    'No pude guardar el orden.',
  )
  return toDetail(data)
}

export async function fetchBookSagas(
  bookId: number | string,
  signal?: AbortSignal,
): Promise<BookSaga[]> {
  const data = await request<BookSaga[]>(
    `/books/${bookId}/sagas`,
    { signal },
    'No pude traer las sagas de este libro.',
  )
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name ?? '',
    position: s.position ?? 0,
    bookCount: s.bookCount ?? 0,
  }))
}

/* ------------------------------------------------------------------ */
/* Armado automático y unir                                            */
/* ------------------------------------------------------------------ */

export interface AutoSagaBookRef {
  bookId: number
  title: string
}

export interface AutoSagaPreview {
  /** Sagas nuevas (solo las de 2 o más libros: lo decide el backend). */
  create: Array<{ name: string; bookCount: number; books: AutoSagaBookRef[] }>
  /** Sagas que ya existen y suman libros nuevos. */
  extend: Array<{ sagaId: number; name: string; addCount: number; books: AutoSagaBookRef[] }>
  totalBooks: number
  /** Sagas que Camila borró a propósito y el armado respeta (no las recrea). */
  skippedDismissed: number
}

export interface AutoSagaApplyResult {
  created: number
  extended: number
  booksAdded: number
}

function toBookRefs(raw: unknown): AutoSagaBookRef[] {
  if (!Array.isArray(raw)) return []
  return raw.map((b: Partial<AutoSagaBookRef>) => ({
    bookId: b.bookId ?? 0,
    title: b.title ?? '',
  }))
}

export async function fetchAutoSagaPreview(signal?: AbortSignal): Promise<AutoSagaPreview> {
  const data = await request<Partial<AutoSagaPreview>>(
    '/sagas/auto/preview',
    { signal },
    'No pude calcular qué sagas armar.',
  )
  const create = (data?.create ?? []).map((c) => ({
    name: c.name ?? '',
    books: toBookRefs(c.books),
    bookCount: c.bookCount ?? (Array.isArray(c.books) ? c.books.length : 0),
  }))
  const extend = (data?.extend ?? []).map((e) => ({
    sagaId: e.sagaId,
    name: e.name ?? '',
    books: toBookRefs(e.books),
    addCount: e.addCount ?? (Array.isArray(e.books) ? e.books.length : 0),
  }))
  return {
    create,
    extend,
    totalBooks:
      data?.totalBooks ??
      create.reduce((n, c) => n + c.bookCount, 0) + extend.reduce((n, e) => n + e.addCount, 0),
    skippedDismissed: data?.skippedDismissed ?? 0,
  }
}

export async function applyAutoSagas(): Promise<AutoSagaApplyResult> {
  const data = await request<Partial<AutoSagaApplyResult>>(
    '/sagas/auto/apply',
    { method: 'POST' },
    'No pude armar las sagas.',
  )
  return {
    created: data?.created ?? 0,
    extended: data?.extended ?? 0,
    booksAdded: data?.booksAdded ?? 0,
  }
}

/** Cuántas sagas automáticas (sin editar) borraría "Deshacer". */
export async function fetchAutoSagaUndoCount(signal?: AbortSignal): Promise<number> {
  const data = await request<{ count?: number }>(
    '/sagas/auto/undo-preview',
    { signal },
    'No pude ver qué se puede deshacer.',
  )
  return data?.count ?? 0
}

export async function undoAutoSagas(): Promise<number> {
  const data = await request<{ deleted?: number }>(
    '/sagas/auto/undo',
    { method: 'POST' },
    'No pude deshacer el armado.',
  )
  return data?.deleted ?? 0
}

/**
 * Une `fromSagaId` DENTRO de `targetId`: sus libros pasan al final de target
 * (los que ya estaban no se duplican) y `from` se borra. Target es la que queda.
 */
export async function mergeSagas(targetId: number, fromSagaId: number): Promise<SagaDetail> {
  const data = await request<SagaDetail>(
    `/sagas/${targetId}/merge`,
    { method: 'POST', json: { fromSagaId } },
    'No pude unir las sagas.',
  )
  return toDetail(data)
}

/** "1.219": los números grandes del armado se leen mejor con separador. */
export function formatCount(n: number): string {
  return n.toLocaleString('es-AR')
}

/**
 * Los títulos que vinieron de Goodreads traen la saga y el tomo al final:
 * "Devilish King (Valentino Empire, #1)". Coma opcional ("Saga #2") y tomos
 * decimales de novelas cortas ("#2.5"). Misma regex que `SeriesDetector` del
 * backend (el armado automático): si cambia una, cambiar la otra.
 */
const SERIES_SUFFIX = /\(([^()]+?),?\s*#(\d+(?:\.\d+)?)\)\s*$/

export function seriesFromTitle(title: string): { series: string; number: number } | null {
  const match = SERIES_SUFFIX.exec(title)
  if (!match) return null
  return { series: match[1].trim(), number: Number.parseFloat(match[2]) }
}

/**
 * Orden por número de tomo. Los libros sin "#N" en el título no se pueden
 * ubicar: quedan al final, en el orden en que estaban (sort estable).
 */
export function sortByVolume<T extends { title: string }>(books: T[]): T[] {
  const volume = (b: T) => seriesFromTitle(b.title)?.number ?? Number.POSITIVE_INFINITY
  return [...books].sort((a, b) => volume(a) - volume(b))
}

