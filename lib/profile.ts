// profile.ts — foto y nombre del perfil, y el redimensionado obligatorio.
//
// Contrato del backend:
//   GET /profile -> {displayName, photoDataUrl, updatedAt}
//   PUT /profile <- {displayName?, photoDataUrl?}   (null explícito borra la foto)
//
// ⚠️ La foto viaja en base64 DENTRO de la base (mismo patrón que `b64_cover`),
// así que entra en cada `pg_dump`. El dump de hoy pesa 1,2 MB. Una foto de
// iPhone son ~4 MB, que en base64 son ~5,5 MB: subirla cruda quintuplicaría el
// backup de años de reseñas escritas a mano. Por eso el redimensionado a
// 400x400 se hace **acá, en el navegador, siempre**, antes de mandar nada.
// El backend rechaza con 400 lo que pase el límite, pero eso es la red de
// seguridad, no el mecanismo.

import { API_BASE_URL, getApiHeaders, readApiError } from '@/lib/api-config'
import {
  dataUrlBytes,
  formatBytes,
  resizeImageFile,
  type ResizeResult,
} from '@/lib/image-resize'

export interface Profile {
  displayName: string | null
  photoDataUrl: string | null
  updatedAt: string | null
}

/** Lado del cuadrado final, en píxeles. */
export const PHOTO_SIZE = 400

/** Calidad de la compresión con pérdida. 0.82 es el punto donde una cara de
 *  400px deja de mejorar a simple vista y el archivo sigue bajando. */
const PHOTO_QUALITY = 0.82

/** Tope duro del lado del cliente: si ni a 400px baja de acá, algo anda mal. */
export const MAX_DATA_URL_BYTES = 400 * 1024

// El redimensionado en sí vive en `lib/image-resize.ts` desde la Fase 10 (las
// sagas también suben imagen). Se re-exporta lo que ya usaba el Perfil para no
// tocar a quien lo importa.
export { dataUrlBytes, formatBytes, type ResizeResult }

/**
 * Redimensiona a 400x400 recortando al centro (cover), no deformando.
 * Ver `resizeImageFile` para el detalle de EXIF y la red de seguridad de peso.
 */
export function resizeProfilePhoto(file: File): Promise<ResizeResult> {
  return resizeImageFile(file, {
    fit: 'cover-square',
    size: PHOTO_SIZE,
    quality: PHOTO_QUALITY,
    maxBytes: MAX_DATA_URL_BYTES,
  })
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export async function fetchProfile(signal?: AbortSignal): Promise<Profile> {
  const baseUrl = await API_BASE_URL
  const response = await fetch(`${baseUrl}/profile`, {
    headers: getApiHeaders(),
    signal,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, 'No pude traer el perfil.'))
  }

  const data = (await response.json()) as Partial<Profile>
  return {
    displayName: data.displayName ?? null,
    photoDataUrl: data.photoDataUrl ?? null,
    updatedAt: data.updatedAt ?? null,
  }
}

/**
 * `photoDataUrl: null` borra la foto; omitir la clave la deja como está. Por eso
 * el payload se arma con `in`, no con `??`: un `null` explícito es un dato.
 */
export async function saveProfile(changes: {
  displayName?: string | null
  photoDataUrl?: string | null
}): Promise<Profile> {
  const baseUrl = await API_BASE_URL
  const payload: Record<string, unknown> = {}
  if ('displayName' in changes) payload.displayName = changes.displayName
  if ('photoDataUrl' in changes) payload.photoDataUrl = changes.photoDataUrl

  const response = await fetch(`${baseUrl}/profile`, {
    method: 'PUT',
    headers: getApiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, 'No pude guardar el perfil.'))
  }

  const data = (await response.json()) as Partial<Profile>
  return {
    displayName: data.displayName ?? null,
    photoDataUrl: data.photoDataUrl ?? null,
    updatedAt: data.updatedAt ?? null,
  }
}
