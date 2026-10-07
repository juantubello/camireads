// image-resize.ts — achicar imágenes en el navegador antes de mandarlas.
//
// Nació adentro de `lib/profile.ts` (la foto del perfil) y se sacó acá cuando
// aparecieron las sagas (Fase 10), que necesitan lo mismo con otra forma:
//
//   - Perfil: cuadrado de 400x400, recortado al centro (`fit: 'cover-square'`).
//   - Saga:   lado mayor ~600px, SIN recortar (`fit: 'contain'`): la imagen de
//             una saga suele ser una tapa o un banner, y recortarla a cuadrado
//             se comería el título.
//
// ⚠️ Por qué es obligatorio y no una optimización: las dos imágenes viajan en
// base64 DENTRO de la base, así que entran en cada `pg_dump`. Una foto de
// iPhone cruda son ~5,5 MB de base64, contra los ~1,2 MB que pesa hoy el
// backup entero. El backend rechaza lo que se pase de su techo, pero eso es la
// red de seguridad, no el mecanismo.

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
  /** Medidas finales del canvas. */
  width: number
  height: number
}

export interface ResizeOptions {
  /**
   * - `cover-square`: cuadrado de `size` x `size` recortando al centro.
   * - `contain`: respeta la proporción; el lado mayor queda en `size` (nunca
   *   agranda una imagen que ya es más chica).
   */
  fit: 'cover-square' | 'contain'
  size: number
  /** Calidad inicial de la compresión con pérdida. */
  quality: number
  /** Tope en bytes decodificados. Si se pasa, baja calidad y después tamaño. */
  maxBytes: number
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
 * Redimensiona una imagen elegida por la usuaria.
 *
 * `createImageBitmap` con `imageOrientation: 'from-image'` es lo que respeta el
 * EXIF de las fotos de iPhone: sin eso las verticales salen acostadas. Si el
 * navegador no lo tiene, se cae a un `<img>`, que en Safari moderno ya aplica
 * la orientación solo.
 */
export async function resizeImageFile(
  file: File,
  options: ResizeOptions,
): Promise<ResizeResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Ese archivo no es una imagen. Elegí una foto.')
  }

  const { source, width, height, release } = await loadImage(file)

  if (!width || !height) {
    release()
    throw new Error('No pude leer esa imagen. Probá con otra.')
  }

  try {
    const draw = (scale: number) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Tu navegador no me deja procesar la imagen.')

      if (options.fit === 'cover-square') {
        const target = Math.round(options.size * scale)
        canvas.width = target
        canvas.height = target
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        // Recorte centrado: el cuadrado más grande que entre en la foto.
        const side = Math.min(width, height)
        const sx = (width - side) / 2
        const sy = (height - side) / 2
        ctx.drawImage(source, sx, sy, side, side, 0, 0, target, target)
      } else {
        const longest = Math.max(width, height)
        const ratio = Math.min(1, options.size / longest) * scale
        canvas.width = Math.max(1, Math.round(width * ratio))
        canvas.height = Math.max(1, Math.round(height * ratio))
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        // Fondo blanco: si viene un PNG con transparencia y sale en JPEG, sin
        // esto lo transparente queda negro.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
      }
      return canvas
    }

    let scale = 1
    let canvas = draw(scale)
    const mimeType = supportsWebp(canvas) ? 'image/webp' : 'image/jpeg'
    let quality = options.quality
    let dataUrl = canvas.toDataURL(mimeType, quality)

    // Red de seguridad: una imagen con mucho detalle puede pasarse igual.
    // Primero se baja la calidad (lo que menos se nota) y, si ni así, el tamaño.
    while (dataUrlBytes(dataUrl) > options.maxBytes) {
      if (quality > 0.45) {
        quality -= 0.12
      } else if (scale > 0.4) {
        scale -= 0.2
        quality = options.quality
        canvas = draw(scale)
      } else {
        throw new Error('Esa imagen es demasiado pesada, incluso achicada. Probá con otra.')
      }
      dataUrl = canvas.toDataURL(mimeType, quality)
    }

    return {
      dataUrl,
      originalBytes: file.size,
      resizedBytes: dataUrlBytes(dataUrl),
      mimeType,
      originalWidth: width,
      originalHeight: height,
      width: canvas.width,
      height: canvas.height,
    }
  } finally {
    release()
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

/** Formatea bytes para mostrarlos en la UI ("1,2 MB", "48 KB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
