'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_PENDING_DRAFTS,
  clearDraft,
  collectPendingDrafts,
  noteExitFailure,
  takeExitFailure,
  writeDraftRecord,
  type DraftEntry,
  type DraftSaveReason,
  type SaveDraftResult,
  newDraftId,
} from '@/lib/draft-storage'

/** Pausa normal entre tecla y tecla antes de escribir a disco. */
const DEBOUNCE_MS = 700

/**
 * Techo del debounce. Escribiendo sin parar, un debounce puro no guarda NUNCA
 * (siempre hay una tecla antes de que venza el timer). Con esto, mientras haya
 * cambios sin guardar se escribe al menos una vez cada 5 segundos.
 */
const MAX_WAIT_MS = 5000

export const DRAFT_SAVE_ERROR_QUOTA =
  'No pude guardar el borrador: no queda lugar en este navegador. ' +
  'Copiá el texto a otro lado (Notas, un mail) o guardá la reseña ahora: ' +
  'si cerrás esta pantalla, lo escrito se pierde.'

export const DRAFT_SAVE_ERROR_BLOCKED =
  'No estoy pudiendo guardar el borrador en este navegador. ' +
  'Suele pasar en una ventana privada de Safari. ' +
  'Copiá el texto a otro lado (Notas, un mail) o guardá la reseña ahora: ' +
  'si cerrás esta pantalla, lo escrito se pierde.'

/** Falló el guardado justo al salir y ya no había pantalla para avisar. */
export const DRAFT_EXIT_ERROR_RECOVERED =
  'Cuando saliste de esta pantalla no pude guardar el borrador en este navegador. ' +
  'Lo que habías escrito lo tengo en memoria y te lo ofrezco acá arriba, pero se ' +
  'pierde si cerrás o recargás la pestaña: recuperalo y guardá la reseña ahora.'

export const DRAFT_EXIT_ERROR_LOST =
  'Cuando saliste de esta pantalla no pude guardar el borrador en este navegador, ' +
  'así que lo último que habías escrito no quedó guardado. Revisá lo que falte y ' +
  'guardá la reseña ahora.'

function messageFor(reason: DraftSaveReason): string {
  return reason === 'quota' ? DRAFT_SAVE_ERROR_QUOTA : DRAFT_SAVE_ERROR_BLOCKED
}

/**
 * Autosave de un formulario.
 *
 * ---------------------------------------------------------------------------
 * REGLA CENTRAL: nada que la usuaria haya escrito se borra por un efecto
 * colateral. Lo guardado se borra en exactamente tres casos:
 *
 *   1. ella toca "Descartar"                  -> `discard(id)`
 *   2. la reseña se guardó bien en el backend -> `clear()` (solo lo de pantalla)
 *   3. ella escribió y después borró todo, dejando el formulario como estaba
 *      -> el autosave limpia lo de pantalla, pero SOLO si hubo edición en esta
 *         sesión. Abrir la pantalla no es una edición.
 *
 * ---------------------------------------------------------------------------
 * EL CARTEL PENDIENTE NO APAGA EL AUTOSAVE
 *
 * La versión anterior cortaba por lo sano: si había un borrador ofrecido y sin
 * resolver, no se escribía nada (`pendingRef` hacía salir temprano al debounce
 * Y a los handlers de salida). O sea que con el cartel en pantalla el autosave
 * estaba APAGADO: ella ignoraba el cartel —lo natural, porque el formulario
 * sigue editable—, escribía una reseña entera y al navegar se perdía completa.
 *
 * La tensión era real: escribir sobre la misma clave pisaba el borrador que el
 * cartel todavía ofrecía recuperar, y no escribir perdía lo nuevo. Las dos son
 * pérdida de datos.
 *
 * Se resuelve no eligiendo: la clave guarda un registro con `live` (lo de
 * pantalla) y `offers` (lo que quedó sin resolver), y el autosave escribe
 * SIEMPRE, tocando solo `live` (ver `lib/draft-storage.ts`). El cartel sigue
 * ofreciendo lo viejo —que sigue en disco, no solo en memoria— y la barra de
 * abajo muestra "Borrador guardado …" de lo nuevo. Recuperar lo viejo tampoco
 * pisa lo nuevo: lo de pantalla se convierte en otra oferta (el `restore` de
 * abajo hace el intercambio en una sola escritura).
 *
 * ---------------------------------------------------------------------------
 * PERSISTIR AL SALIR
 *
 * `beforeunload` solo cubre cerrar o recargar la pestaña. No se dispara con un
 * <Link> de Next, ni con `router.back()`, ni con el gesto de deslizar para
 * volver de Safari — que es como se navega en el iPhone. Y encima el cleanup
 * del efecto de autosave cancela el `setTimeout` pendiente, así que lo último
 * escrito nunca llegaría a `localStorage`.
 *
 * Por eso el borrador se guarda (no se descarta) en el cleanup del efecto, que
 * es lo que corre al desmontar, y además en `pagehide` y en
 * `visibilitychange`, que son los únicos avisos confiables cuando iOS suspende
 * Safari y después descarta la pestaña.
 *
 * Esos guardados forzados ya no tiran el resultado a la basura:
 *
 *   - `pagehide` / `visibilitychange`: la pantalla sigue viva (iOS puede
 *     devolverla tal cual, y bfcache también), así que un fallo se muestra
 *     igual que el del autosave normal. Antes quedaba en pantalla el
 *     "Borrador guardado" de un guardado anterior EXITOSO mientras lo último
 *     escrito no estaba en ningún lado: una afirmación falsa.
 *   - desmontaje: ya no hay UI que actualizar, así que se hacen las dos únicas
 *     cosas útiles que quedan: el dato se guarda en la memoria del módulo
 *     (`draft-storage`), que sobrevive a la navegación interna y permite volver
 *     a ofrecerlo al volver al formulario, y se anota el fallo para que el
 *     próximo montaje de esta misma clave lo cuente en vez de callárselo.
 *
 * ---------------------------------------------------------------------------
 * REFS
 *
 * Los efectos de un mismo commit comparten las clausuras de ESE render. Los
 * refs son el espejo sincrónico: se escriben en el efecto de carga y el de
 * autosave, que corre inmediatamente después en el mismo commit, ya los ve.
 * Los handlers de `pagehide`/`visibilitychange` y el cleanup de desmontaje leen
 * de los mismos refs, así que nunca guardan datos viejos.
 */
export function useFormDraft<T>({
  storageKey,
  data,
  dirty,
  enabled = true,
}: {
  storageKey: string
  data: T
  dirty: boolean
  enabled?: boolean
}) {
  /** Borradores ofrecidos y sin resolver (los carteles). */
  const [pendingDrafts, setPendingDrafts] = useState<DraftEntry<T>[]>([])
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  /** Para qué clave ya se buscaron borradores (una vez por clave, no por montaje). */
  const loadedKeyRef = useRef<string | null>(null)
  /** Espejo sincrónico de `pendingDrafts`. */
  const offersRef = useRef<DraftEntry<T>[]>([])
  /** ¿Tecleó algo en ESTE formulario desde que se abrió? */
  const editedRef = useRef(false)
  /** Se guardó la reseña de verdad: no hay que volver a escribir lo de pantalla. */
  const stoppedRef = useRef(false)
  /** Cuándo fue el último intento de escritura (para el techo del debounce). */
  const lastAttemptRef = useRef(0)
  /** ¿El componente sigue montado? Después del cleanup no hay estado que tocar. */
  const mountedRef = useRef(true)

  const dataRef = useRef(data)
  dataRef.current = data
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const keyRef = useRef(storageKey)
  keyRef.current = storageKey

  const setOffers = useCallback((next: DraftEntry<T>[]) => {
    offersRef.current = next
    setPendingDrafts(next)
  }, [])

  /** Lleva a la UI lo que pasó de verdad. Nunca muestra un guardado que no fue. */
  const report = useCallback((result: SaveDraftResult | null) => {
    if (!result) return
    if (!mountedRef.current) return
    if (result.ok) {
      setSavedAt(result.savedAt)
      setSaveError(null)
    } else {
      // Se limpia el tilde: "Borrador guardado 14:03" al lado de un fallo es,
      // en los hechos, decirle que lo que acaba de escribir está a salvo.
      setSavedAt(null)
      setSaveError(messageFor(result.reason))
    }
  }, [])

  /** ¿Hay trabajo en pantalla que valga la pena conservar? */
  const hasLiveWork = useCallback(
    () =>
      enabledRef.current &&
      !stoppedRef.current &&
      dirtyRef.current &&
      editedRef.current,
    [],
  )

  const liveEntry = useCallback(
    (): DraftEntry<T> => ({ id: newDraftId(), savedAt: new Date().toISOString(), data: dataRef.current }),
    [],
  )

  /**
   * Escribe el registro completo: lo de pantalla MÁS las ofertas sin resolver.
   * Si no queda nada que guardar, se borra la clave.
   */
  const writeRecord = useCallback(
    (live: DraftEntry<T> | null): SaveDraftResult | null => {
      if (typeof window === 'undefined') return null
      if (!live && offersRef.current.length === 0) {
        clearDraft(keyRef.current)
        return null
      }
      return writeDraftRecord(keyRef.current, { live, offers: offersRef.current })
    },
    [],
  )

  /**
   * Escribe el borrador AHORA, sin debounce, si corresponde.
   * Estable (deps vacías) a propósito: los listeners de salida se registran una
   * sola vez y siempre leen el dato fresco desde los refs.
   */
  const persist = useCallback((): SaveDraftResult | null => {
    if (typeof window === 'undefined') return null
    if (!enabledRef.current) return null
    // Ya se guardó la reseña: escribir de nuevo resucitaría lo que `clear()`
    // acaba de borrar.
    if (stoppedRef.current) return null
    if (!dirtyRef.current) return null

    lastAttemptRef.current = Date.now()
    return writeRecord(liveEntry())
  }, [liveEntry, writeRecord])

  // 1) Buscar borradores previos, una sola vez por clave.
  //    Va por clave y no por montaje porque `/edit/[id]` puede cambiar de libro
  //    sin desmontar: con un `checkedRef` booleano, el borrador del segundo
  //    libro no se buscaba nunca.
  useEffect(() => {
    if (!enabled) return
    if (loadedKeyRef.current === storageKey) return
    loadedKeyRef.current = storageKey

    // Estado que es de la clave anterior, no de esta.
    editedRef.current = false
    stoppedRef.current = false
    lastAttemptRef.current = 0

    // Al abrir el formulario, TODO lo que había guardado es una oferta: lo que
    // está en pantalla es el formulario vacío o lo que vino del backend.
    const { drafts, fromMemory } = collectPendingDrafts<T>(storageKey)
    offersRef.current = drafts
    setPendingDrafts(drafts)
    setSavedAt(null)

    // Si la última salida no pudo guardar, no se lo comemos: se cuenta acá.
    const exitFailure = takeExitFailure(storageKey)
    setSaveError(
      exitFailure
        ? fromMemory
          ? DRAFT_EXIT_ERROR_RECOVERED
          : DRAFT_EXIT_ERROR_LOST
        : null,
    )
  }, [enabled, storageKey])

  // 2) Autosave con debounce.
  useEffect(() => {
    if (!enabled || stoppedRef.current) return

    if (!dirty) {
      // Volvió al estado original. Solo tiene sentido borrar si ella escribió
      // y después borró: abrir el formulario NO es haber escrito.
      if (editedRef.current) {
        editedRef.current = false
        // OJO: se borra SOLO lo de pantalla. Las ofertas sin resolver siguen
        // siendo trabajo suyo que nadie miró todavía.
        writeRecord(null)
        setSavedAt(null)
        setSaveError(null)
      }
      return
    }

    editedRef.current = true

    const waited = Date.now() - lastAttemptRef.current
    const delay = waited >= MAX_WAIT_MS ? 0 : DEBOUNCE_MS

    const timer = window.setTimeout(() => {
      report(persist())
    }, delay)

    return () => window.clearTimeout(timer)
  }, [enabled, dirty, storageKey, data, persist, report, writeRecord])

  // 3) Salidas: desmontaje (navegación interna), pagehide, visibilitychange y
  //    cerrar/recargar la pestaña. En todas se GUARDA, nunca se descarta.
  useEffect(() => {
    mountedRef.current = true
    if (typeof window === 'undefined') return

    function onBeforeUnload(event: BeforeUnloadEvent) {
      report(persist())
      if (enabledRef.current && dirtyRef.current && !stoppedRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }

    // En iOS, `pagehide` es el último aviso real antes de que el sistema
    // congele o descarte la pestaña; `beforeunload` puede no llegar nunca.
    // La pantalla puede volver tal cual (bfcache, volver a la app), así que un
    // fallo tiene que quedar visible en vez del tilde de "Borrador guardado".
    function onPageHide() {
      report(persist())
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') report(persist())
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)

      // Desmontar = navegación interna: <Link> de la barra de abajo, Cancelar,
      // la flecha, `router.back()` o el gesto de deslizar de Safari. Ninguna
      // dispara `beforeunload`. El borrador se persiste ACÁ, que es lo último
      // que corre con los datos todavía en memoria.
      mountedRef.current = false
      const key = keyRef.current
      const result = persist()
      if (result && !result.ok) {
        // Ya no hay pantalla donde avisar. Lo útil que queda:
        //  - el dato ya quedó en la memoria del módulo (`draft-storage`), que
        //    sobrevive a la navegación interna: al volver se vuelve a ofrecer;
        //  - se anota el fallo para que el próximo montaje lo diga.
        noteExitFailure(key, result.reason)
        console.warn(
          '[use-form-draft] El guardado al salir falló (%s) para %s. ' +
            'El borrador queda solo en memoria hasta que se recargue la pestaña.',
          result.reason,
          key,
        )
      }
    }
  }, [persist, report])

  /**
   * "Recuperar borrador": devuelve los datos para volcar en el formulario.
   *
   * Si había trabajo en pantalla, NO se pierde: pasa a ser otra oferta (se
   * intercambian) y el cartel lo vuelve a ofrecer enseguida. Todo en una sola
   * escritura, así no hay un instante en que algo no esté en disco.
   */
  const restore = useCallback(
    (id: string): T | null => {
      const target = offersRef.current.find((draft) => draft.id === id)
      if (!target) return null

      let next = offersRef.current.filter((draft) => draft.id !== id)
      if (hasLiveWork()) {
        next = [liveEntry(), ...next].slice(0, MAX_PENDING_DRAFTS)
      }
      setOffers(next)

      // Lo recuperado ya es "algo que escribió": si después vacía el
      // formulario, el autosave puede limpiar.
      editedRef.current = true
      lastAttemptRef.current = Date.now()

      report(
        writeDraftRecord(keyRef.current, {
          live: { id: newDraftId(), savedAt: new Date().toISOString(), data: target.data },
          offers: next,
        }),
      )

      return target.data
    },
    [hasLiveWork, liveEntry, report, setOffers],
  )

  /** "Descartar": la usuaria lo pidió explícitamente, y solo para ESE borrador. */
  const discard = useCallback(
    (id: string) => {
      setOffers(offersRef.current.filter((draft) => draft.id !== id))
      const live = hasLiveWork() ? liveEntry() : null
      const result = writeRecord(live)
      // El tilde solo si de verdad se escribió lo de pantalla.
      if (result && (!result.ok || live)) report(result)
    },
    [hasLiveWork, liveEntry, report, setOffers, writeRecord],
  )

  /**
   * Después de guardar de verdad en el backend.
   * Borra lo de pantalla y apaga el autosave para lo que queda de este montaje:
   * el formulario sigue "sucio" respecto del estado vacío y lo que viene es la
   * navegación al detalle, cuyo desmontaje volvería a escribir el borrador.
   *
   * Las ofertas sin resolver NO se tocan: son trabajo que ella nunca miró y que
   * puede ser de otro libro (la clave de "nueva reseña" es una sola). Se siguen
   * ofreciendo la próxima vez, con su botón de Descartar.
   */
  const clear = useCallback(() => {
    stoppedRef.current = true
    editedRef.current = false
    writeRecord(null)
    setSavedAt(null)
    setSaveError(null)
  }, [writeRecord])

  return {
    /** Borradores sin resolver, del más nuevo al más viejo. Un cartel cada uno. */
    pendingDrafts,
    savedAt,
    saveError,
    /** Hay texto en pantalla que se está guardando solo (para explicarlo en el cartel). */
    hasLiveWork: enabled && dirty,
    restore,
    discard,
    clear,
  }
}
