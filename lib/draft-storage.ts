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
// - Ninguna escritura pisa trabajo que la usuaria todavía no resolvió.
//
// ---------------------------------------------------------------------------
// POR QUÉ LA CLAVE GUARDA VARIOS BORRADORES (formato v2)
// ---------------------------------------------------------------------------
// El formato v1 guardaba UN borrador por clave: `{version, savedAt, data}`.
// Con uno solo hay un caso sin salida: está el cartel "Recuperar borrador"
// ofreciendo el borrador viejo y ella, en vez de tocarlo, escribe una reseña
// nueva (el formulario queda editable, así que es lo natural). Ahí:
//
//   - si el autosave escribe, pisa el borrador que el cartel todavía ofrece;
//   - si no escribe, se pierde todo lo que está escribiendo ahora.
//
// Las dos son pérdida de datos. La salida es no tener que elegir: la clave
// guarda un REGISTRO con
//
//   live   -> lo que está en pantalla ahora (lo que el autosave reescribe)
//   offers -> los borradores que quedaron sin resolver (los que ofrece el cartel)
//
// Así el autosave siempre puede escribir `live` sin tocar `offers`. Al abrir el
// formulario, TODO lo que había guardado (live + offers) pasa a ser una oferta:
// lo que está en pantalla al montar es el formulario vacío / el libro del
// backend, no un borrador.
//
// Se guarda una sola clave y se escribe de una sola vez (`setItem`): no hay
// forma de que queden dos claves inconsistentes si la pestaña muere en el medio.

const PREFIX = 'camireads:draft'
const VERSION = 2

/**
 * Cuántos borradores sin resolver se conservan por formulario.
 *
 * Es un tope de seguridad, no un objetivo: para llegar a él hay que ignorar el
 * cartel en varias sesiones seguidas. Al pasarse se descarta el MÁS VIEJO, que
 * es el que ella ignoró más veces. Tres reseñas de 28k ocupan ~90 KB sobre una
 * cuota de ~5 MB: el tope es por cordura de la interfaz, no por espacio.
 */
export const MAX_PENDING_DRAFTS = 3

/**
 * Un borrador: contenido, cuándo se guardó, y su identidad.
 *
 * `id` existe porque `savedAt` NO sirve para identificar. Al intercambiar
 * borradores se generan dos marcas de tiempo seguidas, y dos llamadas
 * consecutivas a `Date.now()` caen en el mismo milisegundo casi siempre: la
 * deduplicación descartaba uno de los dos borradores. `savedAt` es para
 * mostrarle la hora a la usuaria; `id` es para distinguirlos.
 */
export interface DraftEntry<T> {
  id: string
  savedAt: string
  data: T
}

/** Identificador único de un borrador. */
export function newDraftId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {
    // Safari viejo o contexto inseguro: seguimos con el fallback.
  }
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Lo que se guarda en la clave. */
export interface DraftRecord<T> {
  version: number
  /** Lo que está en pantalla en esta sesión. */
  live: DraftEntry<T> | null
  /** Borradores ofrecidos y todavía sin resolver. */
  offers: DraftEntry<T>[]
}

export type DraftRecordInput<T> = Omit<DraftRecord<T>, 'version'>

export function newReviewDraftKey(): string {
  return `${PREFIX}:new`
}

export function editReviewDraftKey(bookId: string | number): string {
  return `${PREFIX}:edit:${bookId}`
}

/** Por qué no se pudo guardar. Sirve para elegir el mensaje que ve la usuaria. */
export type DraftSaveReason = 'quota' | 'blocked' | 'unavailable'

/**
 * Resultado de una escritura.
 *
 * Antes devolvía `void` y se tragaba la excepción: quien llamaba no tenía forma
 * de saber si el borrador había quedado escrito, así que la UI mostraba
 * "Borrador guardado" aunque no se hubiera guardado nada. Un autosave que
 * miente es peor que no tener autosave.
 */
export type SaveDraftResult =
  | { ok: true; savedAt: string }
  | { ok: false; reason: DraftSaveReason; error?: unknown }

// ---------------------------------------------------------------------------
// Red de seguridad en memoria
// ---------------------------------------------------------------------------
// Si `localStorage` no escribe (Safari privado, cuota llena, una extensión de
// privacidad), el borrador no tiene dónde vivir. Guardarlo acá no reemplaza al
// disco, pero salva el caso más común de todos: ella navega adentro de la app
// (detalle, buscar, volver) y vuelve al formulario. Es el mismo documento, o
// sea la misma memoria, así que el trabajo se puede volver a ofrecer.
//
// Se pierde al recargar o cerrar la pestaña, y eso se le dice con todas las
// letras en el mensaje de error.

const memoryFallback = new Map<string, DraftRecord<unknown>>()

/** Falló el guardado al SALIR: no había UI para avisar. Lo cuenta el próximo montaje. */
const exitFailures = new Map<string, DraftSaveReason>()

export function noteExitFailure(key: string, reason: DraftSaveReason): void {
  exitFailures.set(key, reason)
}

/** Devuelve (y consume) el fallo de salida pendiente para esa clave. */
export function takeExitFailure(key: string): DraftSaveReason | null {
  const reason = exitFailures.get(key)
  if (reason === undefined) return null
  exitFailures.delete(key)
  return reason
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

function isEntry(value: unknown): value is DraftEntry<unknown> {
  if (!value || typeof value !== 'object') return false
  const entry = value as DraftEntry<unknown>
  if (typeof entry.savedAt !== 'string' || entry.data == null) return false
  // Los borradores guardados antes de que existiera `id` siguen siendo
  // válidos: se les asigna uno al leerlos, en vez de descartarlos.
  if (typeof entry.id !== 'string' || !entry.id) entry.id = newDraftId()
  return true
}

/**
 * Normaliza lo que haya en la clave a un registro v2.
 * Acepta el formato viejo (v1, un solo borrador) para no perder lo que ya esté
 * guardado en el navegador de Camila el día que salga esta versión.
 */
function toRecord<T>(parsed: unknown): DraftRecord<T> | null {
  if (!parsed || typeof parsed !== 'object') return null
  const raw = parsed as Record<string, unknown>

  if (raw.version === 1) {
    // v1: `{version, savedAt, data}`. Al abrir el formulario todo lo guardado
    // es una oferta, así que da igual en qué campo caiga; va como `live` y el
    // hook lo convierte en oferta al montar.
    const entry = { id: newDraftId(), savedAt: raw.savedAt, data: raw.data }
    if (!isEntry(entry)) return null
    return { version: VERSION, live: entry as DraftEntry<T>, offers: [] }
  }

  if (raw.version !== VERSION) return null

  const live = isEntry(raw.live) ? (raw.live as DraftEntry<T>) : null
  const offers = Array.isArray(raw.offers)
    ? (raw.offers.filter(isEntry) as DraftEntry<T>[])
    : []

  if (!live && offers.length === 0) return null
  return { version: VERSION, live, offers }
}

export function loadDraftRecord<T>(key: string): DraftRecord<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return toRecord<T>(JSON.parse(raw))
  } catch {
    return null
  }
}

function readMemoryRecord<T>(key: string): DraftRecord<T> | null {
  const record = memoryFallback.get(key)
  return (record as DraftRecord<T> | undefined) ?? null
}

/**
 * Todo lo que quedó guardado para este formulario, ordenado del más nuevo al
 * más viejo. Al abrir el formulario, TODO esto son ofertas.
 *
 * Junta disco y memoria porque pueden no coincidir: si una escritura falló, el
 * disco tiene una versión vieja (o nada) y la memoria tiene la última. Se
 * deduplica por `savedAt`, que es lo que identifica a cada borrador.
 */
export function collectPendingDrafts<T>(key: string): {
  drafts: DraftEntry<T>[]
  /** Alguno de los borradores devueltos existe SOLO en memoria. */
  fromMemory: boolean
} {
  const seen = new Set<string>()
  const memoryOnly = new Set<string>()
  const all: DraftEntry<T>[] = []

  const push = (entry: DraftEntry<T> | null, fromMemory: boolean) => {
    if (!isEntry(entry)) return
    if (seen.has(entry.id)) {
      // Si ya estaba por disco, deja de ser "solo memoria".
      if (!fromMemory) memoryOnly.delete(entry.id)
      return
    }
    seen.add(entry.id)
    if (fromMemory) memoryOnly.add(entry.id)
    all.push(entry)
  }

  const disk = loadDraftRecord<T>(key)
  if (disk) {
    push(disk.live, false)
    disk.offers.forEach((offer) => push(offer, false))
  }

  const memory = readMemoryRecord<T>(key)
  if (memory) {
    push(memory.live, true)
    memory.offers.forEach((offer) => push(offer, true))
  }

  // Más nuevo primero: es el que ella va a querer recuperar.
  all.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0))

  const drafts = all.slice(0, MAX_PENDING_DRAFTS)
  return {
    drafts,
    fromMemory: drafts.some((draft) => memoryOnly.has(draft.id)),
  }
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/**
 * Safari en modo privado y los navegadores con la cuota llena tiran la misma
 * familia de errores; `code` 22 / 1014 son las variantes viejas de WebKit y
 * Gecko, que no siempre traen `name`.
 */
function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: number }
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  )
}

function failed<T>(
  key: string,
  record: DraftRecordInput<T>,
  reason: DraftSaveReason,
  error?: unknown,
): SaveDraftResult {
  // No quedó en disco: al menos que no se vaya de la memoria del documento.
  memoryFallback.set(key, { version: VERSION, ...record } as DraftRecord<unknown>)
  return { ok: false, reason, error }
}

/**
 * Escribe el registro completo (lo de pantalla + lo que quedó sin resolver) de
 * una sola vez.
 */
export function writeDraftRecord<T>(
  key: string,
  record: DraftRecordInput<T>,
): SaveDraftResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'unavailable' }

  const savedAt = record.live?.savedAt ?? new Date().toISOString()

  let serialized: string
  try {
    serialized = JSON.stringify({ version: VERSION, ...record } satisfies DraftRecord<T>)
  } catch (error) {
    console.warn('[draft-storage] No pude serializar el borrador:', error)
    return failed(key, record, 'blocked', error)
  }

  try {
    window.localStorage.setItem(key, serialized)
  } catch (error) {
    // Cuota llena o storage bloqueado: no rompemos el formulario, pero ahora
    // el que llama se entera y puede avisarle a la usuaria.
    console.warn('[draft-storage] No pude guardar el borrador:', error)
    return failed(key, record, isQuotaError(error) ? 'quota' : 'blocked', error)
  }

  // Que `setItem` no tire NO garantiza que haya quedado escrito: hay
  // navegadores y extensiones de privacidad que aceptan la escritura y la
  // descartan en silencio. La única prueba es volver a leerlo y comparar el
  // STRING ENTERO.
  //
  // Antes se comparaban las longitudes. Dos textos distintos de igual largo
  // (cambiar una letra, corregir una tilde, "no" por "sí") pasaban el control:
  // la UI decía "Borrador guardado" con el contenido viejo en disco.
  try {
    if (window.localStorage.getItem(key) !== serialized) {
      console.warn('[draft-storage] El navegador aceptó la escritura pero no la guardó.')
      return failed(key, record, 'blocked')
    }
  } catch (error) {
    return failed(key, record, 'blocked', error)
  }

  memoryFallback.delete(key)
  return { ok: true, savedAt }
}

/** Borra TODO lo guardado para ese formulario (incluida la copia en memoria). */
export function clearDraft(key: string): void {
  memoryFallback.delete(key)
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
