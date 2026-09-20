// draft-storage.ts — borradores de formulario en localStorage.
//
// Camila escribe reseñas larguísimas (la más larga tiene 28.733 caracteres).
// Que se pierda una por cerrar el navegador sería lo peor que puede pasar en
// esta app, así que el borrador se guarda solo mientras escribe.
//
// Reglas:
// - Nada se restaura en silencio: al volver se OFRECE recuperar.
// - Todo va dentro de try/catch: en modo privado de Safari `localStorage`
//   puede tirar excepción, y eso no puede romper el formulario.

const PREFIX = 'camireads:draft'
const VERSION = 1

export interface StoredDraft<T> {
  version: number
  savedAt: string
  data: T
}

export function newReviewDraftKey(): string {
  return `${PREFIX}:new`
}

export function editReviewDraftKey(bookId: string | number): string {
  return `${PREFIX}:edit:${bookId}`
}

export function loadDraft<T>(key: string): StoredDraft<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    if (!parsed || parsed.version !== VERSION || !parsed.data) return null
    return parsed
  } catch {
    return null
  }
}

export function saveDraft<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    const payload: StoredDraft<T> = {
      version: VERSION,
      savedAt: new Date().toISOString(),
      data,
    }
    window.localStorage.setItem(key, JSON.stringify(payload))
  } catch (error) {
    // Cuota llena o storage bloqueado: no rompemos el formulario.
    console.warn('[draft-storage] No pude guardar el borrador:', error)
  }
}

export function clearDraft(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* noop */
  }
}

export function formatDraftTime(savedAt: string): string {
  try {
    return new Date(savedAt).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return savedAt
  }
}
