'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Search, Book, ChevronDown } from 'lucide-react'
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

// Mock data - replace with actual API call
const mockReviews = [
  {
    id: '1',
    title: 'The Midnight Library',
    author: 'Matt Haig',
    coverUrl: '/midnight-library-book-cover.jpg',
    rating: 5,
    review: 'A beautiful exploration of life choices and parallel universes...',
    dateRead: '2024-01-15',
  },
  {
    id: '2',
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    coverUrl: '/project-hail-mary-cover.png',
    rating: 5,
    review: 'Absolutely incredible! The best sci-fi I\'ve read in years...',
    dateRead: '2024-02-20',
  },
  {
    id: '3',
    title: 'Anxious People',
    author: 'Fredrik Backman',
    coverUrl: '/anxious-people-book-cover.jpg',
    rating: 4,
    review: 'Heartwarming and funny, though a bit slow at the start...',
    dateRead: '2024-03-10',
  },
]

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [bookNameFilter, setBookNameFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const filteredReviews = mockReviews.filter((review) => {
    // Text search across title, author, and review
    const matchesSearch =
      searchQuery === '' ||
      review.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.review.toLowerCase().includes(searchQuery.toLowerCase())

    // Author filter
    const matchesAuthor =
      authorFilter === '' ||
      review.author.toLowerCase().includes(authorFilter.toLowerCase())

    // Book name filter
    const matchesBookName =
      bookNameFilter === '' ||
      review.title.toLowerCase().includes(bookNameFilter.toLowerCase())

    // Date range filter
    const reviewDate = new Date(review.dateRead)
    const matchesStartDate = startDate === '' || reviewDate >= new Date(startDate)
    const matchesEndDate = endDate === '' || reviewDate <= new Date(endDate)

    // Rating filter
    const matchesRating = ratingFilter === null || review.rating === ratingFilter

    return (
      matchesSearch &&
      matchesAuthor &&
      matchesBookName &&
      matchesStartDate &&
      matchesEndDate &&
      matchesRating
    )
  })

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
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="px-5 py-4">
          <PageTitle className="mb-4">
            Buscar Reseñas
          </PageTitle>
          
          {/* Main search input */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar por título, autor o reseña..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/30 border-border"
            />
          </div>

          {/* Advanced filters collapsible */}
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between text-sm text-muted-foreground hover:text-foreground"
              >
                <span>
                  Filtros Avanzados {hasActiveFilters && '(Activos)'}
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    showFilters ? 'rotate-180' : ''
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

      <div className="px-5 py-6">
        {searchQuery === '' && !hasActiveFilters ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Comienza a escribir para buscar en tus reseñas
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              O usa los filtros avanzados para refinar resultados
            </p>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Book className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No se encontraron reseñas</p>
            <p className="text-sm text-muted-foreground mt-2">
              Intenta ajustar tu búsqueda o filtros
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground mb-4">
              {filteredReviews.length}{' '}
              {filteredReviews.length === 1 ? 'resultado' : 'resultados'} encontrado{filteredReviews.length === 1 ? '' : 's'}
            </p>
            {filteredReviews.map((review) => (
              <Link
                key={review.id}
                href={`/book/${review.id}`}
                className="block bg-card rounded-lg p-4 border border-border hover:border-primary/50 transition-all hover:shadow-sm"
              >
                <div className="flex gap-4">
                  <img
                    src={review.coverUrl || "/placeholder.svg"}
                    alt={review.title}
                    className="w-16 h-24 object-cover rounded shadow-sm flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-semibold text-foreground line-clamp-1">
                      {review.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {review.author}
                    </p>
                    <StarRating rating={review.rating} size="sm" />
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {review.review}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Leído el {new Date(review.dateRead).toLocaleDateString('es-ES')}
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
