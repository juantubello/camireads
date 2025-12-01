'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, Book, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { StarRating } from '@/components/star-rating'
import { PageTitle } from '@/components/page-title'
import { API_BASE_URL } from '@/lib/api-config'

const TIME_SUFFIX = process.env.NEXT_PUBLIC_TIME_SUFFIX || 'T21:00:00-03:00'
// De "T21:00:00-03:00" me quedo con el offset "-03:00"
const TZ_OFFSET = TIME_SUFFIX.slice(-6)

// Tipo de lo que devuelve el backend en /reviews
type ReviewSearchResult = {
  id: number
  rating: number
  reviewText: string
  createdAt: string
  book: {
    id: number
    title: string
    author: string
    startReadDate: string | null
    endReadDate: string | null
    createdAt: string
    hasUrlCover: boolean
    urlCover: string | null
    b64Cover: string | null
  }
}

type StoredSearchFilters = {
  authorFilter: string
  bookNameFilter: string
  startDate: string
  endDate: string
  ratingFilter: number | null
}

const STORAGE_KEY = 'camireads_search_reviews_filters'

function toReadFrom(date: string): string {
  // 2025-11-15 -> 2025-11-15T00:00:00-03:00
  return `${date}T00:00:00${TZ_OFFSET}`
}

function toReadTo(date: string): string {
  // 2025-11-25 -> 2025-11-25T23:59:59-03:00
  return `${date}T23:59:59${TZ_OFFSET}`
}

export default function SearchPage() {
  const [authorFilter, setAuthorFilter] = useState('')
  const [bookNameFilter, setBookNameFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)

  const [results, setResults] = useState<ReviewSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Filtros abiertos por defecto
  const [showFilters, setShowFilters] = useState(true)

  // Flag para disparar búsqueda automática al volver a la página
  const [shouldAutoSearch, setShouldAutoSearch] = useState(false)

  const hasActiveFilters =
    authorFilter !== '' ||
    bookNameFilter !== '' ||
    startDate !== '' ||
    endDate !== '' ||
    ratingFilter !== null

  // 🧠 Al montar, leo filtros guardados (NO resultados)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const saved = window.sessionStorage.getItem(STORAGE_KEY)
    if (!saved) return

    try {
      const parsed: StoredSearchFilters = JSON.parse(saved)

      setAuthorFilter(parsed.authorFilter || '')
      setBookNameFilter(parsed.bookNameFilter || '')
      setStartDate(parsed.startDate || '')
      setEndDate(parsed.endDate || '')
      setRatingFilter(
        typeof parsed.ratingFilter === 'number' ? parsed.ratingFilter : null
      )

      // Si había algún filtro, marco que hay que buscar automáticamente
      if (
        parsed.authorFilter ||
        parsed.bookNameFilter ||
        parsed.startDate ||
        parsed.endDate ||
        parsed.ratingFilter !== null
      ) {
        setShouldAutoSearch(true)
        setShowFilters(true)
      }
    } catch (e) {
      console.error('Error reading saved search filters', e)
    }
  }, [])

  // Cuando debería hacer búsqueda automática y ya tengo filtros en estado
  useEffect(() => {
    if (!shouldAutoSearch) return
    handleSearch().finally(() => setShouldAutoSearch(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoSearch])

  async function handleSearch() {
    setLoading(true)
    setHasSearched(true)

    try {
      const params = new URLSearchParams()

      if (authorFilter.trim() !== '') {
        params.append('author', authorFilter.trim())
      }
      if (bookNameFilter.trim() !== '') {
        params.append('bookTitle', bookNameFilter.trim())
      }
      if (ratingFilter !== null) {
        params.append('rating', String(ratingFilter))
      }

      if (startDate) {
        params.append('readFrom', toReadFrom(startDate))
      }
      if (endDate) {
        params.append('readTo', toReadTo(endDate))
      }

      const url = `${API_BASE_URL}/reviews?${params.toString()}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Error ${response.status} al buscar reseñas`)
      }

      const data: ReviewSearchResult[] = await response.json()
      setResults(data)

      // 💾 Guardo SOLO los filtros, no los resultados
      if (typeof window !== 'undefined') {
        const toStore: StoredSearchFilters = {
          authorFilter,
          bookNameFilter,
          startDate,
          endDate,
          ratingFilter,
        }
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
      }
    } catch (error) {
      console.error('[SearchPage] Error buscando reseñas:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const clearFilters = () => {
    setAuthorFilter('')
    setBookNameFilter('')
    setStartDate('')
    setEndDate('')
    setRatingFilter(null)
    setResults([])
    setHasSearched(false)

    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  const effectiveMessage =
    !hasSearched && !hasActiveFilters
      ? {
          icon: <Search className="h-12 w-12 text-muted-foreground mb-4" />,
          title: 'Usá los filtros para buscar en tus reseñas',
          subtitle: 'Podés combinar autor, libro, fecha y calificación',
        }
      : results.length === 0
      ? {
          icon: <Book className="h-12 w-12 text-muted-foreground mb-4" />,
          title: 'No se encontraron reseñas',
          subtitle: 'Probá ajustando los filtros de búsqueda',
        }
      : null

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="px-5 py-4">
          <PageTitle className="mb-4">Buscar Reseñas</PageTitle>

          {/* Filtros colapsables (abiertos por defecto) */}
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-sm text-muted-foreground hover:text-foreground"
              >
                <span>Filtros {hasActiveFilters && '(Activos)'}</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    showFilters ? 'rotate-180' : ''
                  }`}
                />
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-4 pt-4">
              {/* Nombre del libro */}
              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label htmlFor="book-name" className="text-sm font-medium">
                  Nombre del Libro
                </Label>
                <Input
                  id="book-name"
                  type="text"
                  placeholder="Filtrar por título del libro..."
                  value={bookNameFilter}
                  onChange={(e) => setBookNameFilter(e.target.value)}
                  className="bg-secondary/30 border-border"
                />
              </div>

              {/* Nombre del autor */}
              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label htmlFor="author" className="text-sm font-medium">
                  Nombre del Autor
                </Label>
                <Input
                  id="author"
                  type="text"
                  placeholder="Filtrar por autor..."
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                  className="bg-secondary/30 border-border"
                />
              </div>

              {/* Rango de fechas de lectura */}
              <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
                <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                  <Label htmlFor="start-date" className="text-sm font-medium">
                    Fecha de Inicio
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-secondary/30 border-border w-full max-w-full"
                  />
                </div>
                <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                  <Label htmlFor="end-date" className="text-sm font-medium">
                    Fecha de Fin
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-secondary/30 border-border w-full max-w-full"
                  />
                </div>
              </div>

              {/* Calificación */}
              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label className="text-sm font-medium">Calificación</Label>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={ratingFilter === null ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRatingFilter(null)}
                    className="flex-1 min-w-[70px]"
                  >
                    Todas
                  </Button>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <Button
                      key={rating}
                      variant={ratingFilter === rating ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRatingFilter(rating)}
                      className="flex-1 min-w-[60px]"
                    >
                      {rating}★
                    </Button>
                  ))}
                </div>
              </div>

              {/* Botones dentro de filtros */}
              <div className="flex flex-col sm:flex-row gap-2 px-4 md:px-0 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="sm:flex-1"
                  onClick={clearFilters}
                  disabled={loading && !hasActiveFilters}
                >
                  Limpiar todos los filtros
                </Button>
                <Button
                  size="sm"
                  className="sm:flex-1"
                  onClick={handleSearch}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Search className="h-4 w-4 mr-2 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Buscar
                    </>
                  )}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <div className="px-5 py-6">
        {effectiveMessage ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {effectiveMessage.icon}
            <p className="text-muted-foreground">{effectiveMessage.title}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {effectiveMessage.subtitle}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              {results.length}{' '}
              {results.length === 1 ? 'resultado' : 'resultados'} encontrado
              {results.length === 1 ? '' : 's'}
            </p>

            {results.map((review) => {
              const book = review.book
              const coverUrl =
                book.urlCover ||
                (book.b64Cover ? `data:image/png;base64,${book.b64Cover}` : '/placeholder.svg')

              const dateRead =
                book.endReadDate || book.startReadDate || review.createdAt

              const shortReview =
                review.reviewText.length > 200
                  ? review.reviewText.slice(0, 200) + '...'
                  : review.reviewText

              return (
                <Link
                  key={review.id}
                  href={`/book/${book.id}`}
                  className="block bg-card rounded-lg p-4 border border-border hover:border-primary/50 transition-all hover:shadow-sm"
                >
                  <div className="flex gap-4">
                    <img
                      src={coverUrl}
                      alt={book.title}
                      className="w-16 h-24 object-cover rounded shadow-sm flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-serif font-semibold text-foreground line-clamp-1">
                        {book.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {book.author}
                      </p>
                      <StarRating rating={review.rating} size="sm" readonly />
                      {shortReview && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {shortReview}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Leído el{' '}
                        {new Date(dateRead).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}