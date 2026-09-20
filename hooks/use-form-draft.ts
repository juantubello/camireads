'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearDraft,
  loadDraft,
  saveDraft,
  type StoredDraft,
} from '@/lib/draft-storage'

const DEBOUNCE_MS = 700

/**
 * Autosave de un formulario + aviso al salir con cambios sin guardar.
 *
 * - Guarda (con debounce) solo cuando el formulario está "sucio".
 * - Al montar busca un borrador previo y lo DEJA PENDIENTE: no pisa nada; el
 *   formulario muestra un cartel para recuperarlo o descartarlo.
 * - Mientras hay un borrador pendiente no se escribe nada encima.
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
  const [pendingDraft, setPendingDraft] = useState<StoredDraft<T> | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const checkedRef = useRef(false)
  const dataRef = useRef(data)
  dataRef.current = data

  // 1) Buscar un borrador previo, una sola vez.
  useEffect(() => {
    if (!enabled || checkedRef.current) return
    checkedRef.current = true
    const found = loadDraft<T>(storageKey)
    if (found) setPendingDraft(found)
  }, [enabled, storageKey])

  // 2) Autosave con debounce.
  useEffect(() => {
    if (!enabled || pendingDraft) return

    if (!dirty) {
      // Si volvió al estado original, el borrador deja de tener sentido.
      clearDraft(storageKey)
      setSavedAt(null)
      return
    }

    const timer = window.setTimeout(() => {
      saveDraft(storageKey, dataRef.current)
      setSavedAt(new Date().toISOString())
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [enabled, pendingDraft, dirty, storageKey, data])

  // 3) Aviso del navegador al cerrar/recargar con cambios sin guardar.
  useEffect(() => {
    if (!enabled || !dirty) return
    function handler(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [enabled, dirty])

  const restore = useCallback((): T | null => {
    if (!pendingDraft) return null
    const restored = pendingDraft.data
    setSavedAt(pendingDraft.savedAt)
    setPendingDraft(null)
    return restored
  }, [pendingDraft])

  const discard = useCallback(() => {
    clearDraft(storageKey)
    setPendingDraft(null)
    setSavedAt(null)
  }, [storageKey])

  /** Después de guardar de verdad en el backend. */
  const clear = useCallback(() => {
    clearDraft(storageKey)
    setPendingDraft(null)
    setSavedAt(null)
  }, [storageKey])

  return { pendingDraft, savedAt, restore, discard, clear }
}
