'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Library, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SagaCover } from '@/components/saga-cover'
import { SagaFormSheet } from '@/components/saga-form-sheet'
import { bookCountLabel, fetchSagas, type SagaSummary } from '@/lib/sagas'

/**
 * "Mis sagas", dentro del Perfil: grilla de tarjetas tipo estante.
 *
 * Proporción de tapa (2:3) para que una saga se vea como un libro más: 2
 * columnas a 375px (cada tarjeta ~165px de ancho, la tapa se distingue) y más
 * columnas a medida que hay lugar. La tarjeta entera es el link (target grande).
 */
export function SagaList() {
  const router = useRouter()
  const [sagas, setSagas] = useState<SagaSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoadError(null)
      const data = await fetchSagas(signal)
      if (signal?.aborted) return
      setSagas(data)
    } catch (error) {
      if (signal?.aborted) return
      setLoadError(error instanceof Error ? error.message : 'No pude traer tus sagas.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <section aria-labelledby="sagas-heading" className="space-y-4">
      {/* Oculto a la vista por lo mismo que "Mis tags": la solapa ya lo dice. */}
      <h2 id="sagas-heading" className="sr-only">
        Mis sagas
      </h2>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {!loading && !loadError && sagas.length > 0
            ? `${sagas.length} ${sagas.length === 1 ? 'saga' : 'sagas'}`
            : ''}
        </p>
        <Button
          type="button"
          className="min-h-11 gap-2"
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Nueva saga
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Cargando tus sagas…
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
        >
          <p>{loadError}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => {
              setLoading(true)
              void load()
            }}
          >
            Reintentar
          </Button>
        </div>
      )}

      {!loading && !loadError && sagas.length === 0 && (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Library aria-hidden="true" className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">Todavía no armaste ninguna saga</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Juntá los libros de una serie y ordenalos como quieras. También podés
            sumar un libro desde su ficha, con «Agregar a saga».
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-5 min-h-11 gap-2"
            onClick={() => setCreating(true)}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Crear mi primera saga
          </Button>
        </div>
      )}

      {sagas.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sagas.map((saga) => (
            <li key={saga.id}>
              <Link
                href={`/sagas/${saga.id}`}
                className="group block rounded-xl p-1 -m-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <SagaCover
                  saga={saga}
                  className="shadow-sm transition-transform group-hover:-translate-y-0.5 group-hover:shadow-md"
                />
                <p className="mt-2 line-clamp-2 font-medium leading-snug text-foreground">
                  {saga.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {bookCountLabel(saga.bookCount)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <SagaFormSheet
        open={creating}
        onOpenChange={setCreating}
        existingNames={sagas.map((s) => s.name)}
        onSaved={(saga) => {
          // Recién creada no tiene libros: lo natural es entrar y agregarlos.
          setSagas((prev) => [...prev, saga])
          router.push(`/sagas/${saga.id}`)
        }}
      />
    </section>
  )
}
