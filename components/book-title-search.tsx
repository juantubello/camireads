'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, X, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { API_BASE_URL, getApiHeaders } from '@/lib/api-config'

/**
 * Buscador rápido por título, para el inicio.
 *
 * NO reemplaza a `/search`: ahí van los filtros (autor, rating, fechas, tags).
 * Esto resuelve el otro caso, el de todos los días: "sé que reseñé este libro,
 * llevame a su ficha" sin pasar por la pantalla de filtros.
 *
 * Por qué no se reusó nada de lo que ya había:
 * - `book-autocomplete.tsx` busca en la API pública de OpenLibrary (metadatos
 *   de libros que todavía no existen acá) y devuelve `{title, author, cover}`
 *   para rellenar un formulario. Acá hace falta lo contrario: buscar en la base
 *   propia y navegar a `/book/{id}`. No es una prop de diferencia: cambia la
 *   fuente, el tipo de dato y lo que pasa al elegir.
 * - `tag-picker.tsx` es un multi-select de tags con chips y opción "crear".
 *   De ahí sí se copió el patrón de combobox accesible (roles ARIA, flechas,
 *   Enter, Escape) que ya está probado en este proyecto.
 *
 * Cuidados de rendimiento (el server de producción es un i3 de 2 núcleos con
 * 1944 libros y el endpoint devuelve la reseña completa, sin paginar):
 * - `MIN_QUERY_LENGTH = 3`. Medido contra el sandbox: 1 letra devuelve 1607
 *   reseñas / 2,7 MB, 2 letras 102 / 288 KB, 3 letras ~25 / 124 KB. Con menos
 *   de 3 el costo no se justifica.
 * - debounce de 300ms + `AbortController`: nunca hay dos requests vivas.
 */
const MIN_QUERY_LENGTH = 3
const DEBOUNCE_MS = 300
const MAX_SUGGESTIONS = 8

type ReviewFromApi = {
  id: number
  book: {
    id: number
    title: string
    author: string
  }
}

export interface TitleSuggestion {
  bookId: number
  title: string
  author: string
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

export function BookTitleSearch({ className }: { className?: string }) {
  const router = useRouter()
  const inputId = useId()
  const listId = `${inputId}-list`

  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<TitleSuggestion[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = query.trim()
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setStatus('idle')
      return
    }

    const controller = new AbortController()
    // El debounce vive en el cleanup del efecto: cada tecla cancela el timer
    // anterior Y aborta la request que estuviera en vuelo.
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
        setSuggestions(dedupeByBook(data).slice(0, MAX_SUGGESTIONS))
        setStatus('ready')
      } catch (error) {
        if (controller.signal.aborted) return
        setSuggestions([])
        setStatus('error')
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed])

  useEffect(() => {
    setActiveIndex(-1)
  }, [suggestions])

  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [])

  function goToBook(suggestion: TitleSuggestion) {
    setOpen(false)
    router.push(`/book/${suggestion.bookId}`)
  }

  function clear() {
    setQuery('')
    setSuggestions([])
    setStatus('idle')
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (open) setOpen(false)
      else clear()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      if (suggestions.length) {
        setActiveIndex((i) => (i + 1) % suggestions.length)
      }
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      if (suggestions.length) {
        setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
      }
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      // Sin nada marcado, Enter elige la primera: es lo que espera el pulgar
      // después de escribir y ver la lista.
      const pick = suggestions[activeIndex >= 0 ? activeIndex : 0]
      if (pick) goToBook(pick)
    }
  }

  const showPanel = open && trimmed.length > 0

  return (
    <div className={cn('relative', className)} ref={containerRef}>
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
        // `type="search"` y no `type="text"`: iOS le pone la tecla "Buscar" al
        // teclado. `h-11` = 44px de target y `text-base` = 16px, que es lo que
        // evita el zoom automático de Safari al enfocar.
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-describedby={`${inputId}-hint`}
        aria-activedescendant={
          activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined
        }
        autoComplete="off"
        enterKeyHint="search"
        value={query}
        placeholder="Buscar un libro por título…"
        className="h-11 pl-9 pr-10 text-base [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
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
            onClick={clear}
            aria-label="Borrar la búsqueda"
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )
      )}

      {/* Lo que pasa se cuenta también por audio, no solo con el spinner. */}
      <p id={`${inputId}-hint`} role="status" aria-live="polite" className="sr-only">
        {tooShort
          ? `Escribí al menos ${MIN_QUERY_LENGTH} letras`
          : status === 'loading'
            ? 'Buscando…'
            : status === 'error'
              ? 'No se pudo buscar'
              : status === 'ready'
                ? `${suggestions.length} ${
                    suggestions.length === 1
                      ? 'libro encontrado'
                      : 'libros encontrados'
                  }`
                : ''}
      </p>

      {/* El desplegable va en `absolute`: se apoya sobre la lista en vez de
          empujarla, así el inicio no salta cada vez que escribe una letra. */}
      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
          <ul
            id={listId}
            role="listbox"
            aria-label="Libros que coinciden con el título"
            className="max-h-[min(60dvh,22rem)] overflow-y-auto py-1"
          >
            {tooShort ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">
                Escribí al menos {MIN_QUERY_LENGTH} letras del título.
              </li>
            ) : status === 'error' ? (
              <li className="flex items-start gap-2 px-3 py-3 text-sm text-destructive">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  No pude buscar ahora. Fijate la conexión y probá de nuevo.
                </span>
              </li>
            ) : status === 'loading' && suggestions.length === 0 ? (
              <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Buscando…
              </li>
            ) : suggestions.length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted-foreground">
                Ningún libro tuyo se llama así.
              </li>
            ) : (
              suggestions.map((suggestion, index) => (
                <li key={suggestion.bookId}>
                  <button
                    type="button"
                    id={`${inputId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => goToBook(suggestion)}
                    className={cn(
                      'flex min-h-11 w-full flex-col items-start justify-center gap-0.5 px-3 py-2 text-left transition-colors',
                      index === activeIndex && 'bg-accent',
                    )}
                  >
                    <span className="line-clamp-1 text-sm font-medium">
                      {suggestion.title}
                    </span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {suggestion.author}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Un libro puede tener más de una reseña y el endpoint devuelve reseñas, no
 * libros. Sin esto el mismo título aparecería repetido en las sugerencias.
 */
function dedupeByBook(reviews: ReviewFromApi[]): TitleSuggestion[] {
  const seen = new Set<number>()
  const out: TitleSuggestion[] = []

  for (const review of reviews) {
    const book = review?.book
    if (!book || seen.has(book.id)) continue
    seen.add(book.id)
    out.push({ bookId: book.id, title: book.title, author: book.author })
  }

  return out
}
