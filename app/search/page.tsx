'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Search, Book, ChevronDown, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { StarRating } from '@/components/star-rating'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { PageTitle } from '@/components/page-title'
import { API_BASE_URL } from '@/lib/api-config'

const TIME_SUFFIX = process.env.NEXT_PUBLIC_TIME_SUFFIX || 'T21:00:00-03:00'
// Ej: "T21:00:00-03:00" -> "-03:00"
const OFFSET = TIME_SUFFIX.slice(-6)

function toReadFrom(date: string | null): string | null {
  if (!date) return null
  return `${date}T00:00:00${OFFSET}`
}

function toReadTo(date: string | null): string | null {
  if (!date) return null
  return `${date}T23:59:59${OFFSET}`
}

interface Review {
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

export default function SearchPage() {
  const [authorFilter, setAuthorFilter] = useState('')
  const [bookNameFilter, setBookNameFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(true)

  const [results, setResults] = useState<Review[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const hasActiveFilters =
    authorFilter !== '' ||
    bookNameFilter !== '' ||
    startDate !== '' ||
    endDate !== '' ||
    ratingFilter !== null

  const clearFilters = () => {
    setAuthorFilter('')
    setBookNameFilter('')
    setStartDate('')
    setEndDate('')
    setRatingFilter(null)
    setResults([])
    setHasSearched(false)
  }

  async function handleSearch() {
    setLoading(true)
    setHasSearched(true)

    try {
      const params = new URLSearchParams()

      if (authorFilter.trim() !== '') {
        params.set('author', authorFilter.trim())
      }
      if (bookNameFilter.trim() !== '') {
        params.set('bookTitle', bookNameFilter.trim())
      }
      if (ratingFilter !== null) {
        params.set('rating', String(ratingFilter))
      }

      const readFrom = toReadFrom(startDate || null)
      const readTo = toReadTo(endDate || null)

      if (readFrom) params.set('readFrom', readFrom)
      if (readTo) params.set('readTo', readTo)

      const url = `${API_BASE_URL}/reviews?${params.toString()}`
      const response = await fetch(url)

      if (!response.ok) {
        console.error('[SearchPage] Error status:', response.status)
        setResults([])
        return
      }

      const data: Review[] = await response.json()
      setResults(data)
    } catch (error) {
      console.error('[SearchPage] Error fetching reviews:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="px-5 py-4">
          <PageTitle className="mb-4">Buscar Reseñas</PageTitle>

          {/* Filtros (collapsible) */}
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-sm text-muted-foreground hover:text-foreground"
              >
                <span>
                  Filtros {hasActiveFilters && '(Activos)'}
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''
                    }`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-4">
              {/* Book name filter */}
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

              {/* Author filter */}
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

              {/* Date range filter */}
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

              {/* Rating filter */}
              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label className="text-sm font-medium">Calificación</Label>
                <div className="flex gap-2">
                  <Button
                    variant={ratingFilter === null ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRatingFilter(null)}
                    className="flex-1"
                  >
                    Todas
                  </Button>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <Button
                      key={rating}
                      variant={ratingFilter === rating ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRatingFilter(rating)}
                      className="flex-1"
                    >
                      {rating}★
                    </Button>
                  ))}
                </div>
              </div>

              {/* 🔍 BUSCAR dentro de filtros */}
              <div className="px-4 md:px-0">
                <Button
                  type="button"
                  onClick={handleSearch}
                  disabled={loading}
                  className="w-full h-11 flex gap-2 justify-center items-center rounded-full text-base"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Buscar
                    </>
                  )}
                </Button>
              </div>

              {/* Clear filters button */}
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className="w-full"
                >
                  Limpiar Todos los Filtros
                </Button>
              )}
            </CollapsibleContent>

          </Collapsible>
        </div>
      </div>

      {/* Resultados */}
      <div className="px-5 py-6">
        {!hasSearched && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Ajustá los filtros y presioná &quot;Buscar&quot; para ver tus reseñas.
            </p>
          </div>
        )}

        {hasSearched && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Book className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No se encontraron reseñas</p>
            <p className="text-sm text-muted-foreground mt-2">
              Probá cambiando los filtros o el rango de fechas.
            </p>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              {results.length}{' '}
              {results.length === 1 ? 'resultado' : 'resultados'} encontrado
              {results.length === 1 ? '' : 's'}
            </p>
            {results.map((review) => (
              <Link
                key={review.id}
                href={`/book/${review.book.id}`}
                className="block bg-card rounded-lg p-4 border border-border hover:border-primary/50 transition-all hover:shadow-sm"
              >
                <div className="flex gap-4">
                  <img
                    src={
                      review.book.urlCover ||
                      (review.book.b64Cover
                        ? `data:image/png;base64,${review.book.b64Cover}`
                        : '/placeholder.svg')
                    }
                    alt={review.book.title}
                    className="w-16 h-24 object-cover rounded shadow-sm flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-semibold text-foreground line-clamp-1">
                      {review.book.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {review.book.author}
                    </p>
                    <StarRating rating={review.rating} size="sm" />
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                      {review.reviewText || 'Sin texto de reseña.'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Leído:{' '}
                      {review.book.startReadDate
                        ? review.book.startReadDate.slice(0, 10)
                        : '—'}
                      {review.book.endReadDate &&
                        ` → ${review.book.endReadDate.slice(0, 10)}`}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
