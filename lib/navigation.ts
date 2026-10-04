'use client'

// navigation.ts — un solo idioma de navegación para toda la app.
//
// El bug original: la flecha de volver del detalle usaba `router.back()` y la
// de la edición era un `<Link href="/book/X">`, o sea un PUSH. Mezclados se
// alimentan entre sí:
//
//   detalle → Editar (push) → flecha (push a detalle) → flecha (back: vuelve a
//   edición) → flecha (push a detalle) → bucle infinito.
//
// Regla: las flechas y Cancelar VUELVEN (`goBackOr`), y después de guardar o
// crear se REEMPLAZA (`replaceTo`), para que "atrás" no devuelva nunca a un
// formulario que ya se abandonó.
//
// El caso borde: si alguien abre /edit/123 directo por URL (o desde un
// buscador), no hay historial adentro de la app y `router.back()` la saca de
// CamiReads. Por eso llevamos la "profundidad" de la entrada actual DENTRO de
// la app y, si es 0 (la entrada con la que se cargó el documento), en vez de
// volver reemplazamos por una ruta de la app.
//
// ---------------------------------------------------------------------------
// POR QUÉ ESTO NO VIVE MÁS EN UN useEffect
// ---------------------------------------------------------------------------
// La primera versión contaba la profundidad desde un `useEffect` sobre
// `usePathname()` (`NavigationTracker`), con un flag `started` en memoria para
// saber si la ruta que estaba viendo era "la primera de esta carga".
//
// Eso tiene una carrera medida: el efecto es un *passive effect*, corre después
// de la hidratación, y **el usuario puede tocar un libro antes de que corra por
// primera vez**. Traza real (inicio pesado, dev server frío):
//
//   t=288ms  module-load  path=/          <- el bundle ya está evaluado
//   t=380ms  click en un libro            <- Next pushea /book/2034
//   t=1166ms sync:in      path=/book/2034  started=false   <- ¡primera corrida!
//            => marca /book/2034 como "primera entrada" => depth 0 ❌
//
// Contra una corrida sana:
//
//   t=315ms  module-load  path=/
//   t=336ms  sync:in      path=/          started=false  => depth 0 ✔
//   t=520ms  click
//   t=590ms  sync:in      path=/book/2034 started=true   => depth 1 ✔
//
// O sea: el resultado dependía de si el efecto ganaba la carrera contra el
// dedo del usuario. Con el inicio cargando 1944 reseñas en un iPhone, la
// perdía seguido. Y hay una segunda variante del mismo problema: si pasan DOS
// navegaciones antes de que el efecto corra, el efecto corre una sola vez y el
// contador se queda corto.
//
// La profundidad no es un dato de React: es un dato del historial. Así que
// ahora se calcula donde realmente pasa, de forma sincrónica:
//
//   1. Al EVALUAR el módulo (antes de hidratar, antes de que ningún handler de
//      React pueda existir) se etiqueta la entrada inicial. En ese instante la
//      entrada actual es, sin ambigüedad, la primera del documento.
//   2. Se envuelven `history.pushState` / `history.replaceState` para contar en
//      el mismo momento en que la entrada se crea o se reemplaza, y se escucha
//      `popstate` para recuperar la etiqueta al volver/avanzar.
//
// Ya no hay "momento correcto" que se pueda perder: no quedan efectos en el
// camino. `NavigationTracker` queda sólo como red de seguridad idempotente.

import type { useRouter } from 'next/navigation'

type AppRouter = ReturnType<typeof useRouter>

/**
 * Clave propia adentro de `history.state`. Se mergea con el state de Next
 * (`__NA`, el árbol interno del router): nunca se pisa lo que ya había.
 */
const DEPTH_KEY = '__camireadsDepth'

/** Profundidad de la entrada actual. */
let depth = 0

/** Ya se instaló el seguimiento (etiqueta inicial + wrappers). */
let installed = false

/**
 * Las funciones nativas, tomadas del prototipo a propósito.
 *
 * Next también envuelve `history.pushState`/`replaceState` (es lo que permite
 * usarlas a mano en el App Router). Si escribiéramos la etiqueta a través del
 * `window.history.replaceState` público estaríamos llamando al wrapper de Next
 * y le haríamos creer que la app navegó. Yendo al prototipo, escribir la
 * etiqueta es invisible para el router.
 */
const nativeReplaceState =
  typeof window !== 'undefined' ? History.prototype.replaceState : null

function readDepth(): number | null {
  try {
    const state = window.history.state as Record<string, unknown> | null
    const value = state?.[DEPTH_KEY]
    return typeof value === 'number' ? value : null
  } catch {
    return null
  }
}

function writeDepth(value: number): void {
  try {
    const state = (window.history.state ?? {}) as Record<string, unknown>
    // Mergeamos: si se pisara el state de Next se rompería su popstate.
    nativeReplaceState?.call(window.history, { ...state, [DEPTH_KEY]: value }, '')
  } catch {
    // Safari en modo privado y otros casos raros: seguimos con el contador en
    // memoria, que igual alcanza para el caso normal.
  }
}

/**
 * Profundidad con la que arranca la entrada inicial del documento.
 *
 * Casi siempre 0. La excepción es cuando el documento se cargó entero por una
 * navegación que salió de la propia app (un click que Next no llegó a manejar
 * del lado del cliente y terminó siendo una navegación de documento, o el
 * fallback duro que hace Next cuando falla el fetch del RSC). Ahí atrás nuestro
 * SÍ hay una pantalla de CamiReads, aunque el contador en memoria se haya ido
 * con el documento anterior.
 *
 * Señales, las dos necesarias:
 * - `document.referrer` del mismo origen ⇒ la entrada anterior es de la app.
 * - `history.length > 1` ⇒ descarta la pestaña nueva (target="_blank"), donde
 *   hay referrer pero no hay nada atrás.
 */
function initialDepth(): number {
  try {
    if (window.history.length <= 1) return 0
    if (!document.referrer) return 0
    const referrer = new URL(document.referrer)
    if (referrer.origin !== window.location.origin) return 0
    // Alcanza con "hay algo atrás": la única decisión que se toma con esto es
    // `depth > 0`, y al volver se recupera la etiqueta real de esa entrada.
    return 1
  } catch {
    return 0
  }
}

/**
 * Instala el seguimiento. Corre como efecto de módulo (ver el comentario de
 * arriba): es lo que garantiza que la entrada inicial quede etiquetada antes de
 * que el usuario pueda tocar nada.
 */
function install(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  // 1) Etiqueta de la entrada actual.
  const known = readDepth()
  if (known !== null) {
    // Recarga (F5) o bfcache: la entrada conserva su state, y con él su
    // profundidad real. No se recalcula nada.
    depth = known
  } else {
    depth = initialDepth()
    writeDepth(depth)
  }

  // 2) Contar en el momento exacto en que el historial cambia.
  const push = window.history.pushState
  const replace = window.history.replaceState

  window.history.pushState = function (this: History, ...args) {
    const result = push.apply(this, args as Parameters<History['pushState']>)
    // Una entrada nueva: una pantalla más de profundidad.
    depth += 1
    writeDepth(depth)
    return result
  }

  window.history.replaceState = function (this: History, ...args) {
    const result = replace.apply(this, args as Parameters<History['replaceState']>)
    // Un replace no suma profundidad, pero el que llamó pudo haber pisado el
    // state entero (`app/search/page.tsx` hace `replaceState({}, …)` para sacar
    // el `?tagIds=`). Reescribimos la etiqueta para que no se pierda.
    writeDepth(depth)
    return result
  }

  // 3) Volver/avanzar: la entrada a la que llegamos ya está etiquetada.
  window.addEventListener('popstate', () => {
    const entryDepth = readDepth()
    if (entryDepth !== null) depth = entryDepth
    else writeDepth(depth)
  })
}

if (typeof window !== 'undefined') install()

/**
 * Red de seguridad idempotente que llama `NavigationTracker` en cada cambio de
 * ruta. Con los wrappers puestos no debería tener nada que corregir; queda por
 * si alguna entrada llegara sin etiquetar (y porque es lo que mantiene a este
 * módulo dentro del bundle del layout, que es lo que hace que `install()` corra
 * en todas las rutas).
 */
export function syncNavigationDepth(): void {
  if (typeof window === 'undefined') return
  install()

  const known = readDepth()
  if (known !== null) {
    depth = known
    return
  }
  writeDepth(depth)
}

/** ¿Hay al menos una entrada de la app atrás de la actual? */
export function canGoBackInApp(): boolean {
  if (typeof window === 'undefined') return false
  const known = readDepth()
  return (known ?? depth) > 0
}

/**
 * Flechas de volver y botones Cancelar.
 * Vuelve si hay historial propio; si no, reemplaza por `fallback` (así nunca
 * se sale de la app ni queda una entrada nueva colgando).
 */
export function goBackOr(router: AppRouter, fallback: string): void {
  if (canGoBackInApp()) {
    router.back()
    return
  }
  replaceTo(router, fallback)
}

/**
 * Después de guardar, crear o borrar: reemplaza la entrada del formulario en
 * vez de apilar una nueva, así "atrás" no vuelve a un formulario obsoleto.
 *
 * Ya no hace falta avisar "esto es un replace": el wrapper de `replaceState`
 * lo ve solo, porque `router.replace()` termina llamándolo.
 */
export function replaceTo(router: AppRouter, href: string): void {
  router.replace(href)
}

/** Solo para los tests manuales/automatizados de navegación. */
export function currentNavigationDepth(): number {
  return depth
}
