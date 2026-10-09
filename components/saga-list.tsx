'use client'

import { memo, useCallback, useDeferredValue, useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Library, Loader2, Plus, Search, Sparkles, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SagaCover } from '@/components/saga-cover'
import { SagaFormSheet } from '@/components/saga-form-sheet'
import { SagaAutoSheet } from '@/components/saga-auto-sheet'
import {
  bookCountLabel,
  fetchAutoSagaUndoCount,
  fetchSagas,
  formatCount,
  normalizeSagaName,
  undoAutoSagas,
  type SagaSummary,
} from '@/lib/sagas'

/* ------------------------------------------------------------------ */
/* Orden                                                               */
/* ------------------------------------------------------------------ */

type SortId = 'az' | 'recent' | 'books'

const SORTS: Array<{ id: SortId; label: string }> = [
  { id: 'az', label: 'A–Z' },
  { id: 'recent', label: 'Recientes' },
  { id: 'books', label: 'Más libros' },
]

/**
 * Orden elegido, por pestaña (igual que la solapa del Perfil): entrar a una
 * saga y volver no tiene que resetearlo. Si el storage falla, A–Z.
 */
const SORT_STORAGE_KEY = 'camireads:sagas-sort'

const isSortId = (v: unknown): v is SortId => SORTS.some((s) => s.id === v)

const byName = (a: SagaSummary, b: SagaSummary) =>
  a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' })

const COMPARATORS: Record<SortId, (a: SagaSummary, b: SagaSummary) => number> = {
  az: byName,
  // ISO 8601: comparar como texto ordena por fecha. Sin fecha, al final.
  recent: (a, b) => {
    if (a.updatedAt === b.updatedAt) return byName(a, b)
    if (!a.updatedAt) return 1
    if (!b.updatedAt) return -1
    return a.updatedAt < b.updatedAt ? 1 : -1
  },
  books: (a, b) => b.bookCount - a.bookCount || byName(a, b),
}

/**
 * "Mis sagas", dentro del Perfil: grilla de tarjetas tipo estante.
 *
 * Proporción de tapa (2:3) para que una saga se vea como un libro más: 2
 * columnas a 375px (cada tarjeta ~165px de ancho, la tapa se distingue) y más
 * columnas a medida que hay lugar. La tarjeta entera es el link (target grande).
 *
 * Con el armado automático puede haber ~300 sagas, así que hay buscador y
 * orden. Para que tipear no se trabe: la grilla se filtra con un valor
 * DIFERIDO (React pinta primero la letra en el input y después, interrumpible,
 * la grilla), los nombres se normalizan una sola vez por carga y no por tecla,
 * y cada tarjeta está memoizada (al filtrar, React solo monta/desmonta, no
 * vuelve a renderizar las que quedan).
 */
export function SagaList() {
  const router = useRouter()
  const searchId = useId()
  const sortId = useId()
  const [sagas, setSagas] = useState<SagaSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [sort, setSortState] = useState<SortId>('az')

  const [autoOpen, setAutoOpen] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const [undoOpen, setUndoOpen] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [undoError, setUndoError] = useState<string | null>(null)
  /** Aviso visible después de deshacer (el armado avisa en su propia hoja). */
  const [notice, setNotice] = useState<string | null>(null)

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

  // "Deshacer" solo aparece si hay algo para deshacer. Si el endpoint falla
  // (o todavía no existe), simplemente no se ofrece: no es motivo para
  // mostrar un error en la grilla.
  const loadUndoCount = useCallback(async (signal?: AbortSignal) => {
    try {
      const count = await fetchAutoSagaUndoCount(signal)
      if (!signal?.aborted) setUndoCount(count)
    } catch {
      if (!signal?.aborted) setUndoCount(0)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    void loadUndoCount(controller.signal)
    return () => controller.abort()
  }, [load, loadUndoCount])

  // Se lee después de montar para que el HTML del server y el primer render
  // del cliente coincidan (mismo criterio que la solapa del Perfil).
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(SORT_STORAGE_KEY)
      if (isSortId(saved)) setSortState(saved)
    } catch {
      // sin storage: A–Z
    }
  }, [])

  function setSort(id: SortId) {
    setSortState(id)
    try {
      window.sessionStorage.setItem(SORT_STORAGE_KEY, id)
    } catch {
      // idem
    }
  }

  const refresh = useCallback(() => {
    void load()
    void loadUndoCount()
  }, [load, loadUndoCount])

  // Nombres normalizados una vez por carga (no por tecla): con 300 sagas,
  // normalizar NFD en cada pulsación es trabajo tirado.
  const indexed = useMemo(
    () => sagas.map((saga) => ({ saga, key: normalizeSagaName(saga.name) })),
    [sagas],
  )
  const sorted = useMemo(
    () => [...indexed].sort((a, b) => COMPARATORS[sort](a.saga, b.saga)),
    [indexed, sort],
  )
  const needle = normalizeSagaName(deferredQuery)
  const visible = useMemo(
    () => (needle ? sorted.filter((s) => s.key.includes(needle)) : sorted).map((s) => s.saga),
    [sorted, needle],
  )
  const existingNames = useMemo(() => sagas.map((s) => s.name), [sagas])

  async function handleUndo() {
    setUndoing(true)
    setUndoError(null)
    try {
      const deleted = await undoAutoSagas()
      setUndoOpen(false)
      setNotice(
        deleted === 0
          ? 'No había sagas automáticas para borrar.'
          : `Borré ${formatCount(deleted)} ${deleted === 1 ? 'saga automática' : 'sagas automáticas'}. Tus libros siguen intactos.`,
      )
      refresh()
    } catch (error) {
      setUndoError(error instanceof Error ? error.message : 'No pude deshacer el armado.')
    } finally {
      setUndoing(false)
    }
  }

  const hasSagas = sagas.length > 0
  const filtering = needle.length > 0
  const countText = !hasSagas
    ? ''
    : filtering
      ? `${formatCount(visible.length)} de ${formatCount(sagas.length)} sagas`
      : `${formatCount(sagas.length)} ${sagas.length === 1 ? 'saga' : 'sagas'}`

  return (
    <section aria-labelledby="sagas-heading" className="space-y-4">
      {/* Oculto a la vista por lo mismo que "Mis tags": la solapa ya lo dice. */}
      <h2 id="sagas-heading" className="sr-only">
        Mis sagas
      </h2>

      {/* Acciones. Con flex-wrap: a 375px entran las dos; con letra grande del
          sistema, bajan de renglón en vez de cortarse. Sin sagas no van: el
          estado vacío ya ofrece las mismas dos, con más explicación. */}
      {(hasSagas || loading || loadError) && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1 gap-2"
            onClick={() => setAutoOpen(true)}
          >
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            Armar automáticamente
          </Button>
          <Button type="button" className="min-h-11 gap-2" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Nueva saga
          </Button>
        </div>
      )}

      {undoCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setUndoError(null)
            setUndoOpen(true)
          }}
          className="-mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Undo2 aria-hidden="true" className="h-4 w-4" />
          Deshacer el armado automático
        </button>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg bg-secondary p-3 text-sm text-foreground"
        >
          <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="flex-1">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Cerrar el aviso"
            className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Buscador y orden: solo tienen sentido con varias sagas. */}
      {sagas.length > 1 && (
        <div className="space-y-2">
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Buscar una saga por nombre
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar saga…"
              className="h-11 pl-9 pr-10 text-base [&::-webkit-search-cancel-button]:hidden"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Borrar la búsqueda"
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
              {countText}
            </p>
            {/* <select> nativo: en el iPhone abre la ruedita del sistema, que es
                lo más cómodo para tres opciones. */}
            <div className="flex items-center gap-2">
              <label htmlFor={sortId} className="text-xs text-muted-foreground">
                Ordenar
              </label>
              <select
                id={sortId}
                value={sort}
                onChange={(e) => {
                  if (isSortId(e.target.value)) setSort(e.target.value)
                }}
                className="min-h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {sagas.length === 1 && <p className="text-xs text-muted-foreground">{countText}</p>}

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

      {!loading && !loadError && !hasSagas && (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <Library aria-hidden="true" className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">Todavía no armaste ninguna saga</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Las puedo armar solas con los libros que en el título dicen de qué saga son. O juntá los
            de una serie a mano y ordenalos como quieras.
          </p>
          <Button type="button" className="mt-5 min-h-11 gap-2" onClick={() => setAutoOpen(true)}>
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            Armar mis sagas
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 min-h-11 gap-2"
            onClick={() => setCreating(true)}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Crear una a mano
          </Button>
        </div>
      )}

      {hasSagas && filtering && visible.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Ninguna saga se llama así.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => setQuery('')}
          >
            Ver todas
          </Button>
        </div>
      )}

      {visible.length > 0 && <SagaGrid sagas={visible} />}

      <SagaFormSheet
        open={creating}
        onOpenChange={setCreating}
        existingNames={existingNames}
        onSaved={(saga) => {
          // Recién creada no tiene libros: lo natural es entrar y agregarlos.
          setSagas((prev) => [...prev, saga])
          router.push(`/sagas/${saga.id}`)
        }}
      />

      <SagaAutoSheet
        open={autoOpen}
        onOpenChange={setAutoOpen}
        onApplied={() => {
          setNotice(null)
          refresh()
        }}
      />

      <AlertDialog open={undoOpen} onOpenChange={(open) => !undoing && setUndoOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Deshacer el armado automático?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  Se {undoCount === 1 ? 'borra' : 'borran'}{' '}
                  <strong className="text-foreground">
                    {formatCount(undoCount)}{' '}
                    {undoCount === 1 ? 'saga automática' : 'sagas automáticas'}
                  </strong>{' '}
                  que todavía no tocaste.
                </p>
                <p className="font-medium text-foreground">
                  Las que editaste se quedan. Tus libros y reseñas no se tocan.
                </p>
                {undoError && (
                  <p role="alert" className="text-destructive">
                    {undoError}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={undoing} className="h-11">
              Mejor no
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleUndo()
              }}
              disabled={undoing}
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {undoing && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              Sí, deshacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Grilla                                                              */
/* ------------------------------------------------------------------ */

// Memoizadas: la grilla solo se vuelve a pintar cuando cambia la lista
// visible (filtro diferido u orden), nunca por la tecla en sí ni por abrir una
// hoja. Y al filtrar, las tarjetas que quedan no se re-renderizan.
const SagaGrid = memo(function SagaGrid({ sagas }: { sagas: SagaSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {sagas.map((saga) => (
        <SagaCard key={saga.id} saga={saga} />
      ))}
    </ul>
  )
})

const SagaCard = memo(function SagaCard({ saga }: { saga: SagaSummary }) {
  return (
    <li>
      <Link
        href={`/sagas/${saga.id}`}
        className="group block rounded-xl p-1 -m-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SagaCover
          saga={saga}
          className="shadow-sm transition-transform group-hover:-translate-y-0.5 group-hover:shadow-md"
        />
        <p className="mt-2 line-clamp-2 font-medium leading-snug text-foreground">{saga.name}</p>
        <p className="text-xs text-muted-foreground">
          {bookCountLabel(saga.bookCount)}
          {/* Texto y no solo color: se lee igual con VoiceOver y sin color.
              Discreta porque no es un problema, es información. */}
          {saga.autoDetected && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
              Automática
            </>
          )}
        </p>
      </Link>
    </li>
  )
})
