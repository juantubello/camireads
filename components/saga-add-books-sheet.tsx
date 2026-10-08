'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, BookOpen, Check, Loader2, Plus, Search, X } from 'lucide-react'
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
import { API_BASE_URL, getApiHeaders } from '@/lib/api-config'
import { addBookToSaga, bookCoverSrc, type SagaDetail } from '@/lib/sagas'

/**
 * Mismos números que `book-title-search.tsx` (medidos ahí contra el sandbox):
 * con menos de 3 letras el endpoint devuelve cientos de reseñas completas.
 */
const MIN_QUERY_LENGTH = 3
const DEBOUNCE_MS = 300
const MAX_RESULTS = 20
/**
 * Por autor el tope es más alto: el caso de uso es "traer todos los tomos de
 * esta autora" y hay autoras con decenas de libros (Rina Kent tiene 48). Con
 * 20 se cortaría justo la saga que se quería armar.
 */
const MAX_RESULTS_BY_AUTHOR = 80

/**
 * Buscar por título o por autor (pedido de Camila): para armar una saga es
 * mucho más rápido traer todos los libros de la autora y agregarlos de una.
 */
type SearchMode = 'title' | 'author'

const MODES: Record<
  SearchMode,
  { label: string; param: string; placeholder: string; srLabel: string; empty: string; hint: string }
> = {
  title: {
    label: 'Título',
    param: 'bookTitle',
    placeholder: 'Título del libro…',
    srLabel: 'Buscar un libro por título',
    empty: 'Ningún libro tuyo se llama así.',
    hint: 'del título',
  },
  author: {
    label: 'Autor',
    param: 'author',
    placeholder: 'Nombre del autor o autora…',
    srLabel: 'Buscar libros por autor',
    empty: 'No tenés libros de ese autor o autora.',
    hint: 'del autor',
  },
}

/**
 * Los títulos que vinieron de Goodreads traen la saga y el tomo al final:
 * "Devilish King (Valentino Empire, #1)". Se extraen para ordenar por TOMO y no
 * por título (si no, "Brutal Princess #4" saldría antes que "Devilish King #1").
 * Acepta tomos decimales de novelas cortas ("#2.5").
 */
const SERIES_SUFFIX = /\(([^()]+?),?\s*#(\d+(?:\.\d+)?)\)\s*$/

function seriesKey(title: string): { series: string; number: number } | null {
  const match = SERIES_SUFFIX.exec(title)
  if (!match) return null
  return { series: match[1].trim(), number: Number.parseFloat(match[2]) }
}

const compareText = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })

/**
 * Orden para "por autor": agrupado por saga y, dentro de cada una, por número
 * de tomo; los libros sin "(Saga, #N)" van por título (orden natural, así "2"
 * va antes que "10"). Como agregar suma al FINAL, agregar en este orden deja
 * la saga ordenada sin tocar nada.
 */
function bySeriesThenTitle(a: Candidate, b: Candidate): number {
  const ka = seriesKey(a.title)
  const kb = seriesKey(b.title)
  const groupA = ka?.series ?? a.title
  const groupB = kb?.series ?? b.title
  const byGroup = compareText(groupA, groupB)
  if (byGroup !== 0) return byGroup
  if (ka && kb && ka.number !== kb.number) return ka.number - kb.number
  return compareText(a.title, b.title)
}

type ReviewFromApi = {
  id: number
  book: {
    id: number
    title: string
    author: string
    urlCover?: string | null
    b64Cover?: string | null
  }
}

interface Candidate {
  bookId: number
  title: string
  author: string
  cover: string | null
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Hoja "Agregar libros" de una saga: busca en los libros PROPIOS por título
 * (`GET /reviews?bookTitle=`, como el buscador del inicio) o por autor
 * (`GET /reviews?author=`, el mismo filtro de Buscar) y agrega al final.
 *
 * La hoja queda abierta después de agregar: armar una saga es sumar 3, 5, 10
 * libros seguidos, y cerrar/abrir para cada uno sería un castigo. Los
 * resultados quedan a la vista (una búsqueda como "academia" trae varios tomos
 * de la misma saga) y el recién agregado pasa a "Ya está".
 */
export function SagaAddBooksSheet({
  open,
  onOpenChange,
  saga,
  onSagaChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saga: SagaDetail
  onSagaChange: (saga: SagaDetail) => void
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<SearchMode>('title')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Candidate[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [adding, setAdding] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setMode('title')
      setQuery('')
      setResults([])
      setStatus('idle')
      setError(null)
      setNotice(null)
    }
  }

  // Al abrir, el foco va al buscador: la hoja existe para tipear un título.
  // Con un respiro para que vaul termine de montar (si no, se lo roba).
  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 300)
    return () => window.clearTimeout(timer)
  }, [open])

  const trimmed = query.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH
  const inSaga = new Set(saga.books.map((b) => b.bookId))
  const modeConfig = MODES[mode]
  // Por autor se agrupa por saga detectada en el título: una autora suele
  // tener VARIAS sagas, y agregar "todo lo de la autora" metería libros de
  // otras sagas (aviso de Juan). El "agregar de una" es por grupo.
  const groups = mode === 'author' ? groupBySeries(results) : []
  const [addingGroup, setAddingGroup] = useState<string | null>(null)

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    // Debounce + abort en el cleanup: cada tecla cancela el timer anterior Y
    // la request en vuelo. Nunca hay dos vivas.
    const timer = setTimeout(async () => {
      setStatus('loading')
      try {
        const baseUrl = await API_BASE_URL
        const response = await fetch(
          `${baseUrl}/reviews?${MODES[mode].param}=${encodeURIComponent(trimmed)}`,
          { headers: getApiHeaders(), signal: controller.signal },
        )
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data: ReviewFromApi[] = await response.json()
        const books = dedupeByBook(data)
        setResults(
          mode === 'author'
            ? books.sort(bySeriesThenTitle).slice(0, MAX_RESULTS_BY_AUTHOR)
            : books.slice(0, MAX_RESULTS),
        )
        setStatus('ready')
      } catch {
        if (controller.signal.aborted) return
        setResults([])
        setStatus('error')
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, mode])

  /**
   * Agrega los libros de UNA saga detectada, en serie y en el orden en que se
   * ven (por tomo): cada POST suma al final, así que la saga queda ordenada.
   * En serie y no en paralelo a propósito: en paralelo el orden de llegada
   * sería azaroso. Si uno falla, frena y avisa cuántos llegaron a entrar.
   */
  async function addGroup(group: SeriesGroup) {
    const pending = group.items.filter((c) => !inSaga.has(c.bookId))
    if (adding !== null || pending.length === 0) return
    setAdding(-1)
    setAddingGroup(group.key)
    setError(null)
    setNotice(null)
    let added = 0
    try {
      for (const candidate of pending) {
        const updated = await addBookToSaga(saga.id, candidate.bookId)
        onSagaChange(updated)
        added++
      }
      setNotice(
        `Agregué ${added} ${added === 1 ? 'libro' : 'libros'} de «${group.series}» al final de «${saga.name}».`,
      )
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'No pude agregar los libros.'
      setError(added > 0 ? `Agregué ${added} y después falló: ${reason}` : reason)
    } finally {
      setAdding(null)
      setAddingGroup(null)
    }
  }

  async function add(candidate: Candidate) {
    if (adding !== null) return
    setAdding(candidate.bookId)
    setError(null)
    setNotice(null)
    try {
      const updated = await addBookToSaga(saga.id, candidate.bookId)
      onSagaChange(updated)
      setNotice(`Agregué «${candidate.title}» en la posición ${updated.books.length}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude agregar el libro.')
    } finally {
      setAdding(null)
    }
  }

  function renderCandidate(candidate: Candidate) {
    const already = inSaga.has(candidate.bookId)
    const busy = adding === candidate.bookId
    return (
      <li key={candidate.bookId} className="flex items-center gap-3 py-2">
        {candidate.cover ? (
          <img
            src={candidate.cover}
            alt=""
            className="h-12 w-8 shrink-0 rounded object-cover"
          />
        ) : (
          <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded bg-secondary">
            <BookOpen aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug">
            {candidate.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {candidate.author}
          </p>
        </div>
        {already ? (
          <span className="inline-flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm text-muted-foreground">
            <Check aria-hidden="true" className="h-4 w-4" />
            Ya está
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0 gap-1"
            onClick={() => void add(candidate)}
            aria-disabled={adding !== null}
            aria-label={`Agregar ${candidate.title} a la saga`}
          >
            {busy ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Plus aria-hidden="true" className="h-4 w-4" />
            )}
            Agregar
          </Button>
        )}
      </li>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Alto fijo y generoso: si la hoja creciera con cada resultado, saltaría
          mientras se tipea. */}
      <DrawerContent className="h-[80dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader>
            <DrawerTitle className="text-xl">Agregar libros</DrawerTitle>
            <DrawerDescription>
              Buscá entre tus libros por título o por autor. Se agregan al final
              de «{saga.name}» y después los podés ordenar.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4">
            {/* Selector Título / Autor. Cambiar de modo deja lo escrito y vuelve
                a buscar: "Rina" sirve igual para probar en los dos. */}
            <div
              role="group"
              aria-label="Buscar por"
              className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
            >
              {(Object.keys(MODES) as SearchMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m)
                    setError(null)
                    setNotice(null)
                    inputRef.current?.focus()
                  }}
                  className={
                    mode === m
                      ? 'min-h-11 rounded-lg bg-background text-sm font-medium text-foreground shadow-sm'
                      : 'min-h-11 rounded-lg text-sm text-muted-foreground hover:text-foreground'
                  }
                >
                  {MODES[m].label}
                </button>
              ))}
            </div>

            <div className="relative">
              <label htmlFor={inputId} className="sr-only">
                {modeConfig.srLabel}
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
                onChange={(e) => {
                  setQuery(e.target.value)
                  setError(null)
                }}
                placeholder={modeConfig.placeholder}
                className="h-11 pl-9 pr-10 text-base [&::-webkit-search-cancel-button]:hidden"
                aria-describedby={`${inputId}-status`}
              />
              {status === 'loading' ? (
                <Loader2
                  aria-hidden="true"
                  className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                />
              ) : (
                query.length > 0 && (
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
                )
              )}
            </div>

            <p id={`${inputId}-status`} role="status" aria-live="polite" className="sr-only">
              {tooShort
                ? `Escribí al menos ${MIN_QUERY_LENGTH} letras`
                : status === 'loading'
                  ? 'Buscando…'
                  : status === 'ready'
                    ? `${results.length} ${results.length === 1 ? 'libro encontrado' : 'libros encontrados'}`
                    : ''}
            </p>

            {notice && (
              <p role="status" className="mt-3 flex items-start gap-2 text-sm text-foreground">
                <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{notice}</span>
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>

          {/* La lista scrollea sola; `data-vaul-no-drag` para que deslizar la
              lista no arrastre la hoja hacia abajo. */}
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-4" data-vaul-no-drag="">
            {trimmed.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Escribí al menos {MIN_QUERY_LENGTH} letras {modeConfig.hint}.
              </p>
            ) : tooShort ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Seguí escribiendo…
              </p>
            ) : status === 'error' ? (
              <p className="py-6 text-center text-sm text-destructive">
                No pude buscar ahora. Fijate la conexión y probá de nuevo.
              </p>
            ) : status !== 'ready' && results.length === 0 ? (
              // Entre que termina el debounce y vuelve la respuesta (en el
              // server de 2 núcleos puede tardar un par de segundos) la lista
              // no puede quedar en blanco: parecería que no hay resultados.
              <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Buscando…
              </p>
            ) : results.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {modeConfig.empty}
              </p>
            ) : (
              mode === 'author' ? (
                <div className="space-y-4 pb-2">
                  {groups.map((group) => {
                    const pending = group.items.filter((c) => !inSaga.has(c.bookId)).length
                    const headingId = `${inputId}-grupo-${group.key}`
                    return (
                      <section key={group.key} aria-labelledby={headingId}>
                        <div className="flex items-center justify-between gap-2 border-b border-border pb-1">
                          <h3 id={headingId} className="min-w-0 truncate text-sm font-semibold">
                            {group.series ?? 'Sin saga en el título'}
                            <span className="ml-1 font-normal text-muted-foreground">
                              · {group.items.length}
                            </span>
                          </h3>
                          {/* Solo grupos de saga real: "sin saga" son libros
                              sueltos y se agregan de a uno. */}
                          {group.series && pending > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="min-h-11 shrink-0 gap-1"
                              onClick={() => void addGroup(group)}
                              aria-disabled={adding !== null}
                              aria-label={`Agregar los ${pending} libros de ${group.series} a la saga`}
                            >
                              {addingGroup === group.key ? (
                                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                              ) : (
                                <Plus aria-hidden="true" className="h-4 w-4" />
                              )}
                              Agregar los {pending}
                            </Button>
                          )}
                        </div>
                        <ul className="divide-y divide-border">
                          {group.items.map(renderCandidate)}
                        </ul>
                      </section>
                    )
                  })}
                </div>
              ) : (
                <ul className="divide-y divide-border" aria-label="Resultados">
                  {results.map(renderCandidate)}
                </ul>
              )
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

/** El endpoint devuelve reseñas, no libros: un libro con dos reseñas saldría repetido. */
function dedupeByBook(reviews: ReviewFromApi[]): Candidate[] {
  const seen = new Set<number>()
  const out: Candidate[] = []
  for (const review of reviews) {
    const book = review?.book
    if (!book || seen.has(book.id)) continue
    seen.add(book.id)
    out.push({
      bookId: book.id,
      title: book.title,
      author: book.author,
      cover: bookCoverSrc(book.urlCover) ?? bookCoverSrc(book.b64Cover),
    })
  }
  return out
}

interface SeriesGroup {
  key: string
  /** null = libros sin "(Saga, #N)" en el título. */
  series: string | null
  items: Candidate[]
}

/**
 * Agrupa por la saga que dice el título (los resultados ya vienen ordenados por
 * saga y tomo). Las sagas van primero, en orden alfabético; los libros sin saga
 * detectada, todos juntos al final.
 */
function groupBySeries(candidates: Candidate[]): SeriesGroup[] {
  const bySeries = new Map<string, SeriesGroup>()
  const loose: Candidate[] = []
  for (const candidate of candidates) {
    const key = seriesKey(candidate.title)
    if (!key) {
      loose.push(candidate)
      continue
    }
    const id = key.series.toLocaleLowerCase('es')
    const group = bySeries.get(id) ?? { key: `s-${bySeries.size}`, series: key.series, items: [] }
    group.items.push(candidate)
    bySeries.set(id, group)
  }
  const groups = [...bySeries.values()]
  if (loose.length > 0) groups.push({ key: 'sueltos', series: null, items: loose })
  return groups
}
