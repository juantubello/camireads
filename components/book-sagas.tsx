'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Check, Library, Loader2, Plus } from 'lucide-react'
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
  addBookToSaga,
  bookCountLabel,
  createSaga,
  fetchBookSagas,
  fetchSagas,
  normalizeSagaName,
  removeBookFromSaga,
  type BookSaga,
  type SagaDetail,
  type SagaSummary,
} from '@/lib/sagas'
import { cn } from '@/lib/utils'

/** De la respuesta de la saga, en qué posición quedó este libro. */
function toBookSaga(saga: SagaDetail, bookId: number): BookSaga | null {
  const entry = saga.books.find((b) => b.bookId === bookId)
  if (!entry) return null
  return { id: saga.id, name: saga.name, position: entry.position, bookCount: saga.books.length }
}

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, 'es')
}

/**
 * Bloque "Sagas" de la ficha del libro: chips "Nombre · #3" que llevan a la
 * saga, y "Agregar a saga" que abre una hoja con todas las sagas tildables.
 *
 * Va en la cabecera, junto a los tags, porque es identidad del libro (igual
 * que los tags), no de la reseña.
 *
 * Si el backend todavía no tiene sagas (deploy del front antes que el del
 * back) el GET falla: no se muestra ningún error en la ficha, solo el botón.
 * El error recién aparece si se abre la hoja, que es cuando importa.
 */
export function BookSagas({ bookId, bookTitle }: { bookId: number; bookTitle: string }) {
  const [sagas, setSagas] = useState<BookSaga[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetchBookSagas(bookId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setSagas(data)
      })
      .catch(() => {
        // silencioso a propósito: ver el comentario del componente
      })
    return () => controller.abort()
  }, [bookId])

  return (
    <div>
      <ul className="flex flex-wrap items-center gap-2" aria-label="Sagas del libro">
        {sagas.map((saga) => (
          <li key={saga.id}>
            <Link
              href={`/sagas/${saga.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`Saga ${saga.name}, libro ${saga.position} de ${saga.bookCount}`}
            >
              <Library aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="max-w-[12rem] truncate">{saga.name}</span>
              <span className="tabular-nums text-muted-foreground">· #{saga.position}</span>
            </Link>
          </li>
        ))}
        <li>
          <Button
            type="button"
            variant="ghost"
            className="h-11 px-3 text-primary"
            onClick={() => setOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {sagas.length > 0 ? 'Editar sagas' : 'Agregar a saga'}
          </Button>
        </li>
      </ul>

      <BookSagasSheet
        open={open}
        onOpenChange={setOpen}
        bookId={bookId}
        bookTitle={bookTitle}
        memberships={sagas}
        onMembershipsChange={setSagas}
      />
    </div>
  )
}

function BookSagasSheet({
  open,
  onOpenChange,
  bookId,
  bookTitle,
  memberships,
  onMembershipsChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookId: number
  bookTitle: string
  memberships: BookSaga[]
  onMembershipsChange: (next: BookSaga[]) => void
}) {
  const nameId = useId()
  const [all, setAll] = useState<SagaSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchSagas()
      setAll(data.slice().sort(byName))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No pude traer tus sagas.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Se trae la lista recién al abrir: la mayoría de las visitas a una ficha no
  // abren esta hoja, y no hace falta pagar el GET en cada una.
  useEffect(() => {
    if (open) {
      setError(null)
      setNewName('')
      void load()
    }
  }, [open, load])

  const memberOf = new Map(memberships.map((m) => [m.id, m]))
  const busy = busyId !== null || creating

  function applySaga(saga: SagaDetail) {
    const entry = toBookSaga(saga, bookId)
    const others = memberships.filter((m) => m.id !== saga.id)
    onMembershipsChange((entry ? [...others, entry] : others).sort(byName))
    // El conteo de la lista también cambia.
    setAll((prev) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { books, ...summary } = saga
      return prev.some((s) => s.id === saga.id)
        ? prev.map((s) => (s.id === saga.id ? summary : s))
        : [...prev, summary].sort(byName)
    })
  }

  async function toggle(saga: SagaSummary) {
    if (busy) return
    setBusyId(saga.id)
    setError(null)
    try {
      const updated = memberOf.has(saga.id)
        ? await removeBookFromSaga(saga.id, bookId)
        : await addBookToSaga(saga.id, bookId)
      applySaga(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude actualizar la saga.')
    } finally {
      setBusyId(null)
    }
  }

  const trimmedNew = newName.trim().replace(/\s+/g, ' ')
  const clash =
    trimmedNew.length > 0 &&
    all.some((s) => normalizeSagaName(s.name) === normalizeSagaName(trimmedNew))

  async function createAndAdd() {
    if (busy || !trimmedNew || clash) return
    setCreating(true)
    setError(null)
    try {
      const created = await createSaga({ name: trimmedNew })
      // La saga ya existe aunque el agregado falle: que aparezca en la lista.
      applySaga(created)
      setNewName('')
      const withBook = await addBookToSaga(created.id, bookId)
      applySaga(withBook)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude crear la saga.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[80dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader>
            <DrawerTitle className="text-xl">Sagas</DrawerTitle>
            <DrawerDescription>
              Tildá las sagas donde va
              <span className="mt-0.5 block truncate font-medium text-foreground/80">
                {bookTitle}
              </span>
            </DrawerDescription>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-4" data-vaul-no-drag="">
            {loading && all.length === 0 ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Cargando tus sagas…
              </p>
            ) : loadError ? (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p>{loadError}</p>
                <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => void load()}>
                  Reintentar
                </Button>
              </div>
            ) : all.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Todavía no tenés sagas. Creá la primera acá abajo y este libro
                queda adentro.
              </p>
            ) : (
              <ul className="divide-y divide-border" aria-label="Tus sagas">
                {all.map((saga) => {
                  const member = memberOf.get(saga.id)
                  const rowBusy = busyId === saga.id
                  return (
                    <li key={saga.id}>
                      {/* Un checkbox nativo con la fila entera como label: el
                          target es toda la fila y el lector anuncia
                          "casilla, marcada" sin ARIA propio. */}
                      <label
                        className={cn(
                          'flex min-h-14 cursor-pointer items-center gap-3 py-2',
                          busy && !rowBusy && 'opacity-60',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={Boolean(member)}
                          onChange={() => void toggle(saga)}
                          aria-disabled={busy}
                        />
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                            'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
                            member
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input bg-card',
                          )}
                        >
                          {rowBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            member && <Check className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-foreground">
                            {saga.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {member
                              ? `Es el #${member.position} de ${saga.bookCount}`
                              : bookCountLabel(saga.bookCount)}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-border px-4 pt-3">
            <label htmlFor={nameId} className="block text-sm font-medium">
              Crear saga nueva
            </label>
            <div className="flex gap-2">
              <Input
                id={nameId}
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void createAndAdd()
                  }
                }}
                placeholder="Nombre de la saga"
                maxLength={80}
                autoComplete="off"
                enterKeyHint="done"
                className="min-h-11 flex-1 text-base"
                aria-invalid={clash || undefined}
                aria-describedby={clash ? `${nameId}-clash` : undefined}
              />
              <Button
                type="button"
                className="min-h-11 shrink-0 gap-1"
                onClick={() => void createAndAdd()}
                aria-disabled={busy || !trimmedNew || clash}
              >
                {creating ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus aria-hidden="true" className="h-4 w-4" />
                )}
                Crear
              </Button>
            </div>
            {clash && (
              <p id={`${nameId}-clash`} className="text-sm text-destructive">
                Ya tenés una saga con ese nombre: tildala en la lista.
              </p>
            )}
            {error && (
              <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>

          <DrawerFooter>
            <Button type="button" className="h-12 w-full text-base" onClick={() => onOpenChange(false)}>
              Listo
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
