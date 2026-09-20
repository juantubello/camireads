// tags.ts — cliente y helpers de la API de tags.
//
// Contrato del backend:
//   GET  /tags                                   -> Tag[] (ordenado por nombre)
//   POST /tags {name, color?}                    -> 201 nuevo | 200 el existente
//   PUT  /reviews/book/{bookId}/tags {tagIds, newTagNames}
//                                                -> 200 {bookId, tags: BookTag[]}
// Y `book.tags` viene embebido en /reviews/latest, /reviews/book/{id} y /reviews.

import { API_BASE_URL, getApiHeaders, readApiError } from '@/lib/api-config'

export interface BookTag {
  id: number
  name: string
  slug: string
  color: string | null
}

export interface Tag extends BookTag {
  bookCount?: number
}

/** Tag ya elegido en un formulario. `id: null` = todavía no existe en la base. */
export interface TagSelection {
  id: number | null
  name: string
  slug: string
  color: string | null
}

/**
 * Paleta de los tags que ya existen en la base. Los tags creados con
 * `newTagNames` vuelven con `color: null`, así que el chip necesita un color
 * por defecto para no quedar transparente.
 */
export const TAG_PALETTE = [
  '#C77D6A',
  '#7D8C6A',
  '#8C7D6A',
  '#6A7D8C',
  '#8C6A7D',
] as const

export const DEFAULT_TAG_COLOR = '#8C7D6A'

/**
 * Mismo criterio que el slug de Java: minúsculas y sin acentos.
 * Sirve para detectar en la UI que "Tengo en físico" ya existe ANTES de mandar
 * nada, así se reusa el tag en vez de intentar duplicarlo.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Normaliza para comparar/filtrar sin acentos ni mayúsculas. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Color estable para un tag: el suyo, o uno derivado del slug. */
export function tagColor(tag: { color?: string | null; slug?: string | null }): string {
  if (tag.color && /^#[0-9a-fA-F]{6}$/.test(tag.color)) return tag.color
  const slug = tag.slug ?? ''
  if (!slug) return DEFAULT_TAG_COLOR
  let hash = 0
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}

export function toSelection(tag: BookTag): TagSelection {
  return { id: tag.id, name: tag.name, slug: tag.slug, color: tag.color }
}

export function newSelection(name: string): TagSelection {
  const clean = name.trim().replace(/\s+/g, ' ')
  return { id: null, name: clean, slug: slugify(clean), color: null }
}

export function sameSelection(a: TagSelection, b: TagSelection): boolean {
  if (a.id !== null && b.id !== null) return a.id === b.id
  return a.slug === b.slug
}

export async function fetchTags(signal?: AbortSignal): Promise<Tag[]> {
  const baseUrl = await API_BASE_URL
  const response = await fetch(`${baseUrl}/tags`, {
    headers: getApiHeaders(),
    signal,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, 'No pude traer los tags.'))
  }

  return (await response.json()) as Tag[]
}

/**
 * Guarda los tags de un libro. Ojo: la respuesta es `{bookId, tags:[...]}`,
 * NO un array pelado. Un tagId inexistente da 404.
 */
export async function saveBookTags(
  bookId: number | string,
  selections: TagSelection[],
): Promise<BookTag[]> {
  const baseUrl = await API_BASE_URL
  const payload = {
    tagIds: selections
      .filter((t): t is TagSelection & { id: number } => t.id !== null)
      .map((t) => t.id),
    newTagNames: selections.filter((t) => t.id === null).map((t) => t.name),
  }

  const response = await fetch(`${baseUrl}/reviews/book/${bookId}/tags`, {
    method: 'PUT',
    headers: getApiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(
      await readApiError(
        response,
        response.status === 404
          ? 'Alguno de los tags ya no existe. Recargá la página y volvé a elegirlos.'
          : 'No pude guardar los tags.',
      ),
    )
  }

  const data = (await response.json()) as { bookId: number; tags: BookTag[] }
  return data.tags ?? []
}
