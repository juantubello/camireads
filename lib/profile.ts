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

export interface ResizeResult {
  dataUrl: string
  /** Bytes del archivo original que eligió la usuaria. */
  originalBytes: number
  /** Bytes del data URL que se va a mandar (lo que realmente pesa en la base). */
  resizedBytes: number
  /** 'image/webp' o 'image/jpeg' según lo que soporte el navegador. */
  mimeType: string
  originalWidth: number
  originalHeight: number
}

/**
 * ¿Este navegador sabe exportar WebP desde un canvas?
 * Safari sabe desde la 14, pero no damos por hecho nada: si `toDataURL` ignora
 * el tipo pedido devuelve un PNG, y el prefijo lo delata.
 */
function supportsWebp(canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.toDataURL('image/webp', 0.5).startsWith('data:image/webp')
  } catch {
    return false
  }
}

/** Bytes reales de un data URL (la parte base64, decodificada). */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  if (comma === -1) return 0
  const b64 = dataUrl.slice(comma + 1)
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

/**
 * Redimensiona a 400x400 recortando al centro (cover), no deformando.
 *
 * `createImageBitmap` con `imageOrientation: 'from-image'` es lo que respeta el
 * EXIF de las fotos de iPhone: sin eso las verticales salen acostadas. Si el
 * navegador no lo tiene, se cae a un `<img>`, que en Safari moderno ya aplica
 * la orientación solo.
 */
export async function resizeProfilePhoto(file: File): Promise<ResizeResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Ese archivo no es una imagen. Elegí una foto.')
  }

  const { source, width, height, release } = await loadImage(file)

  if (!width || !height) {
    release()
    throw new Error('No pude leer esa imagen. Probá con otra.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = PHOTO_SIZE
  canvas.height = PHOTO_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    release()
    throw new Error('Tu navegador no me deja procesar la imagen.')
  }

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Recorte centrado: tomamos el cuadrado más grande que entre en la foto.
  const side = Math.min(width, height)
  const sx = (width - side) / 2
  const sy = (height - side) / 2
  ctx.drawImage(source, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
  release()

  const mimeType = supportsWebp(canvas) ? 'image/webp' : 'image/jpeg'
  let dataUrl = canvas.toDataURL(mimeType, PHOTO_QUALITY)

  // Red de seguridad: una foto con mucho detalle puede pasarse igual. Bajamos
  // la calidad antes que el tamaño, que es lo que menos se nota en una cara.
  let quality = PHOTO_QUALITY
  while (dataUrlBytes(dataUrl) > MAX_DATA_URL_BYTES && quality > 0.4) {
    quality -= 0.12
    dataUrl = canvas.toDataURL(mimeType, quality)
  }

  return {
    dataUrl,
    originalBytes: file.size,
    resizedBytes: dataUrlBytes(dataUrl),
    mimeType,
    originalWidth: width,
    originalHeight: height,
  }
}

type LoadedImage = {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // seguimos por el camino del <img>
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('No pude abrir esa imagen.'))
      el.src = url
    })
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
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

/** Formatea bytes para mostrarlos en la UI ("1,2 MB", "48 KB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
