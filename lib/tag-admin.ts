// tag-admin.ts — ABM de tags (crear / renombrar / recolorear / borrar).
//
// Va aparte de `lib/tags.ts` a propósito: ese archivo lo importan los
// formularios y el detalle del libro (código recién verificado), y acá hay
// operaciones destructivas que nada de eso debería poder llamar por accidente.
//
// Contrato del backend (ya desplegado y verificado):
//   GET    /tags                       -> Tag[] con bookCount, ordenado por nombre
//   POST   /tags   {name, color?}      -> 201 el nuevo | 200 el que ya existía (mismo slug)
//   PUT    /tags/{id} {name?, color?}  -> 200 | 409 si el slug choca con otro tag
//   DELETE /tags/{id}                  -> 204 | 404
//
// El 409 trae el motivo en `message` y se muestra TAL CUAL (ver `readApiError`).

import { API_BASE_URL, getApiHeaders, readApiError } from '@/lib/api-config'
import type { Tag } from '@/lib/tags'

/** Colores elegibles desde la UI. Son los 5 que ya usan los tags sembrados. */
export const TAG_COLOR_CHOICES = [
  { hex: '#C77D6A', name: 'Terracota' },
  { hex: '#7D8C6A', name: 'Oliva' },
  { hex: '#8C7D6A', name: 'Arena' },
  { hex: '#6A7D8C', name: 'Azul apagado' },
  { hex: '#8C6A7D', name: 'Ciruela' },
] as const

export interface CreatedTag {
  tag: Tag
  /** false = el backend devolvió 200 porque el slug ya existía: se reusó. */
  created: boolean
}

export async function createTag(
  name: string,
  color?: string | null,
): Promise<CreatedTag> {
  const baseUrl = await API_BASE_URL
  const response = await fetch(`${baseUrl}/tags`, {
    method: 'POST',
    headers: getApiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: name.trim().replace(/\s+/g, ' '), color: color ?? null }),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, 'No pude crear el tag.'))
  }

  const tag = (await response.json()) as Tag
  return { tag, created: response.status === 201 }
}

export async function updateTag(
  id: number,
  changes: { name?: string; color?: string | null },
): Promise<Tag> {
  const baseUrl = await API_BASE_URL
  const payload: Record<string, unknown> = {}
  if (changes.name !== undefined) payload.name = changes.name.trim().replace(/\s+/g, ' ')
  if (changes.color !== undefined) payload.color = changes.color

  const response = await fetch(`${baseUrl}/tags/${id}`, {
    method: 'PUT',
    headers: getApiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    // El 409 del backend explica cuál es el tag que choca: se muestra literal.
    throw new Error(
      await readApiError(
        response,
        response.status === 404
          ? 'Ese tag ya no existe. Recargá la pantalla.'
          : 'No pude guardar el tag.',
      ),
    )
  }

  return (await response.json()) as Tag
}

export async function deleteTag(id: number): Promise<void> {
  const baseUrl = await API_BASE_URL
  const response = await fetch(`${baseUrl}/tags/${id}`, {
    method: 'DELETE',
    headers: getApiHeaders(),
  })

  // 204 sin cuerpo. Un 404 significa que ya no estaba: para la UI da igual.
  if (!response.ok && response.status !== 404) {
    throw new Error(await readApiError(response, 'No pude borrar el tag.'))
  }
}
