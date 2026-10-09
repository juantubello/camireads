'use client'

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronRight, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import {
  bookCountLabel,
  fetchSagas,
  normalizeSagaName,
  type SagaSummary,
} from '@/lib/sagas'

/**
 * Nombre "pelado" para detectar sagas parecidas: sin acentos, sin signos y
 * sin la "s" final de cada palabra. Así "Hayes Brother" y "Hayes Brothers"
 * (el caso que motivó "Unir") dan lo mismo.
 */
function looseName(name: string): string {
  return normalizeSagaName(name)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 ? w.replace(/s$/, '') : w))
    .join(' ')
}

function isSimilar(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

/**
 * Hoja "Unir con otra saga": elegir CUÁL se suma a la saga actual. La actual
 * es la que queda (con su nombre, foto y orden); la elegida se vacía al final
 * de esta y se borra. La confirmación la hace la pantalla de la saga con un
 * AlertDialog, para no apilar dos modales (hoja + diálogo) en el iPhone.
 *
 * Arriba van las "parecidas" (nombre casi igual): es lo que se viene a buscar
 * casi siempre, y con ~300 sagas no tiene sentido hacerlas buscar.
 */
export function SagaMergeSheet({
  open,
  onOpenChange,
  current,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: Pick<SagaSummary, 'id' | 'name'>
  onPick: (other: SagaSummary) => void
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [sagas, setSagas] = useState<SagaSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  // Lista fresca en cada apertura: pudo haber cambiado (otra unión, armado).
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setSagas(null)
    setError(null)
    setQuery('')
    fetchSagas(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSagas(data)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'No pude traer tus sagas.')
      })
    return () => controller.abort()
  }, [open, reloadKey])

  const others = useMemo(() => {
    if (!sagas) return []
    return sagas
      .filter((s) => s.id !== current.id)
      .map((saga) => ({ saga, key: normalizeSagaName(saga.name), loose: looseName(saga.name) }))
      .sort((a, b) => a.saga.name.localeCompare(b.saga.name, 'es', { numeric: true, sensitivity: 'base' }))
  }, [sagas, current.id])

  const currentLoose = looseName(current.name)
  const similar = useMemo(
    () => others.filter((o) => isSimilar(o.loose, currentLoose)).map((o) => o.saga),
    [others, currentLoose],
  )
  const needle = normalizeSagaName(deferredQuery)
  const results = useMemo(
    () => (needle ? others.filter((o) => o.key.includes(needle)) : others).map((o) => o.saga),
    [others, needle],
  )

  function renderOption(saga: SagaSummary) {
    return (
      <li key={saga.id}>
        <button
          type="button"
          onClick={() => onPick(saga)}
          className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-snug text-foreground">{saga.name}</span>
            <span className="block text-xs text-muted-foreground">
              {bookCountLabel(saga.bookCount)}
              {saga.autoDetected && ' · Automática'}
            </span>
          </span>
          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </li>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[80dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader>
            <DrawerTitle className="text-xl">Unir con otra saga</DrawerTitle>
            <DrawerDescription>
              Elegí la saga que querés sumar a «{current.name}». Sus libros pasan al
              final de esta, y la otra se borra.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4">
            <div className="relative">
              <label htmlFor={inputId} className="sr-only">
                Buscar la otra saga por nombre
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={inputId}
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar saga…"
                className="h-11 pl-9 pr-10 text-base [&::-webkit-search-cancel-button]:hidden"
                aria-describedby={`${inputId}-status`}
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    inputRef.current?.focus()
                  }}
                  aria-label="Borrar la búsqueda"
                  className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              )}
            </div>
            <p id={`${inputId}-status`} role="status" aria-live="polite" className="sr-only">
              {sagas && needle
                ? `${results.length} ${results.length === 1 ? 'saga encontrada' : 'sagas encontradas'}`
                : ''}
            </p>
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-4" data-vaul-no-drag="">
            {error ? (
              <div role="alert" className="py-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 min-h-11"
                  onClick={() => setReloadKey((k) => k + 1)}
                >
                  Reintentar
                </Button>
              </div>
            ) : !sagas ? (
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Cargando tus sagas…
              </p>
            ) : others.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No tenés otras sagas para unir.
              </p>
            ) : (
              <div className="space-y-4 pb-2">
                {!needle && similar.length > 0 && (
                  <section aria-labelledby={`${inputId}-similar`}>
                    <h3 id={`${inputId}-similar`} className="border-b border-border pb-1 text-sm font-semibold">
                      Con nombre parecido
                    </h3>
                    <ul className="divide-y divide-border">{similar.map(renderOption)}</ul>
                  </section>
                )}
                <section aria-labelledby={`${inputId}-all`}>
                  <h3 id={`${inputId}-all`} className="border-b border-border pb-1 text-sm font-semibold">
                    {needle ? 'Resultados' : 'Todas'}
                  </h3>
                  {results.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Ninguna saga se llama así.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">{results.map(renderOption)}</ul>
                  )}
                </section>
              </div>
            )}
          </div>

          <DrawerFooter>
            <Button type="button" variant="outline" className="h-12 w-full text-base" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
