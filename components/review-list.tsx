'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StarRating } from '@/components/star-rating'
import { Book, Review, PaginatedResponse } from '@/lib/types'
import { Loader2 } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api-config'
import { PageTitle } from '@/components/page-title'

type ReviewFromApi = {
  id: number
  rating: number
  reviewText: string
  createdAt: string              // fecha de la review
  book: {
    id: number
    title: string
    author: string
    urlCover?: string | null
    hasUrlCover?: boolean | null
    startReadDate?: string | null
    endReadDate?: string | null
    createdAt?: string | null    // fecha del libro en la BD
    b64Cover?: string | null
  }
}

type SpringPage<T> = {
  content: T[]
  totalPages: number
  totalElements: number
  number: number
  size: number
  first: boolean
  last: boolean
}

interface BookWithReview extends Book {
  review?: Review
}

export function ReviewList() {
  const [books, setBooks] = useState<BookWithReview[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [usingMockData, setUsingMockData] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 20
  
  useEffect(() => {
    fetchBooks(0)
  }, [])
  
async function fetchBooks(page: number) {
  const isFirstPage = page === 0

  if (isFirstPage) {
    setLoading(true)
  } else {
    setLoadingMore(true)
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/reviews/latest?page=${page}&size=${PAGE_SIZE}`
    )

    if (!response.ok) {
      throw new Error('Backend API not available')
    }

    const data: SpringPage<ReviewFromApi> = await response.json()

    // 🔁 mapeamos las reviews del backend al formato BookWithReview que usa el front
    const mappedItems = data.content.map(mapReviewToBookWithReview)

    if (isFirstPage) {
      setBooks(mappedItems)
    } else {
      setBooks(prev => [...prev, ...mappedItems])
    }

    // hasMore = !last
    setHasMore(!data.last)
    setCurrentPage(data.number)
    setUsingMockData(false)
  } catch (error) {
    console.log('[v0] Backend API not available, using mock data for preview')
  } finally {
    setLoading(false)
    setLoadingMore(false)
  }
}
  
  function handleLoadMore() {
    fetchBooks(currentPage + 1)
  }
  
function mapReviewToBookWithReview(review: ReviewFromApi): BookWithReview {
  const { book } = review

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    start_read_date: book.startReadDate ?? '',
    end_read_date: book.endReadDate ?? '',
    created_at: book.createdAt ?? review.createdAt ?? '',
    has_url_cover: book.hasUrlCover ?? false,
    url_cover: book.urlCover ?? undefined,
    b64_cover: book.b64Cover ?? undefined,
    review: {
      id: review.id,
      book_id: book.id,
      rating: review.rating,
      review_text: review.reviewText,
      created_at: review.createdAt,
    },
  }
}

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }
  
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="text-center max-w-sm">
          <BookOpen className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2 text-balance">Aún no hay libros</h2>
          <p className="text-muted-foreground text-balance">
            Comienza tu viaje de lectura agregando tu primera reseña
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <PageTitle subtitle="Tu viaje personal de lectura">
        CamiReads
      </PageTitle>
      
      {usingMockData && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-4 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 rounded-md border border-amber-200 dark:border-amber-800">
          Modo de vista previa - Mostrando datos de ejemplo
        </p>
      )}
      
      <div className="space-y-2">
        {books.map((book) => (
          <Link key={book.id} href={`/book/${book.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
              <CardContent className="p-0">
                <div className="flex gap-2.5 p-2.5">
                  <div className="flex-shrink-0">
                    {book.url_cover || book.b64_cover ? (
                      <img
                        src={book.url_cover || `data:image/png;base64,${book.b64_cover}`}
                        alt={book.title}
                        className="w-12 h-[70px] object-cover rounded shadow-sm"
                      />
                    ) : (
                      <div className="w-12 h-[70px] bg-secondary rounded flex items-center justify-center">
                        <BookOpen className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
                    <h3 className="font-serif font-semibold text-sm leading-tight line-clamp-1">
                      {book.title}
                    </h3>
                    <p className="text-xs text-muted-foreground">{book.author}</p>
                    
                    {book.review && (
                      <>
                        <StarRating rating={book.review.rating} size="sm" readonly />
                        
                        {book.review.review_text && (
                          <p className="text-xs text-muted-foreground line-clamp-1 leading-snug mt-0.5">
                            {book.review.review_text}
                          </p>
                        )}
                        
                        {book.review.created_at && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {new Date(book.review.created_at).toLocaleDateString('es-ES', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      
      {hasMore && (
        <div className="flex justify-center mt-6 mb-4">
          <Button
            onClick={handleLoadMore}
            disabled={loadingMore}
            variant="outline"
            className="min-w-[200px]"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Cargando...
              </>
            ) : (
              'Cargar más'
            )}
          </Button>
        </div>
      )}
      
      {!hasMore && books.length > PAGE_SIZE && (
        <p className="text-center text-sm text-muted-foreground mt-6 mb-4">
          Has llegado al final de tus reseñas
        </p>
      )}
    </div>
  )
}

function BookOpen({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}
