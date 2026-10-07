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
 * (`GET /reviews?bookTitle=`, como el buscador del inicio) y agrega al final.
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
          `${baseUrl}/reviews?bookTitle=${encodeURIComponent(trimmed)}`,
          { headers: getApiHeaders(), signal: controller.signal },
        )
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data: ReviewFromApi[] = await response.json()
        setResults(dedupeByBook(data).slice(0, MAX_RESULTS))
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
  }, [trimmed])

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

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Alto fijo y generoso: si la hoja creciera con cada resultado, saltaría
          mientras se tipea. */}
      <DrawerContent className="h-[80dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader>
            <DrawerTitle className="text-xl">Agregar libros</DrawerTitle>
            <DrawerDescription>
              Buscá entre tus libros. Se agregan al final de «{saga.name}» y
              después los podés ordenar.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4">
            <div className="relative">
              <label htmlFor={inputId} className="sr-only">
                Buscar un libro por título
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
                placeholder="Título del libro…"
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
                Escribí al menos {MIN_QUERY_LENGTH} letras del título.
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
                Ningún libro tuyo se llama así.
              </p>
            ) : (
              <ul className="divide-y divide-border" aria-label="Resultados">
                {results.map((candidate) => {
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
                })}
              </ul>
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
