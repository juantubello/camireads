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

// Mock data for preview/development when backend is unavailable
const mockBooks: BookWithReview[] = [
  {
    id: '1',
    title: 'La Biblioteca de la Medianoche',
    author: 'Matt Haig',
    url_cover: '/midnight-library-book-cover.jpg',
    has_url_cover: true,
    start_read_date: '2024-01-01',
    end_read_date: '2024-01-15',
    review: {
      id: '1',
      book_id: '1',
      rating: 5,
      review_text: 'Una hermosa exploración de las decisiones de la vida y los universos paralelos. Me encantó cada página y la forma en que el autor teje las diferentes realidades.',
      created_at: '2024-03-15',
    }
  },
  {
    id: '2',
    title: 'Proyecto Hail Mary',
    author: 'Andy Weir',
    url_cover: '/project-hail-mary-cover.png',
    has_url_cover: true,
    start_read_date: '2024-02-01',
    end_read_date: '2024-02-20',
    review: {
      id: '2',
      book_id: '2',
      rating: 5,
      review_text: '¡Absolutamente increíble! La mejor ciencia ficción que he leído en años. Lleno de humor y ciencia fascinante que te mantiene pegado a las páginas.',
      created_at: '2024-03-10',
    }
  },
  {
    id: '3',
    title: 'Gente Ansiosa',
    author: 'Fredrik Backman',
    url_cover: '/anxious-people-book-cover.jpg',
    has_url_cover: true,
    start_read_date: '2024-03-01',
    end_read_date: '2024-03-10',
    review: {
      id: '3',
      book_id: '3',
      rating: 4,
      review_text: 'Conmovedor y divertido, aunque un poco lento al principio. Los personajes son maravillosamente complejos y la narrativa te hace reflexionar sobre la condición humana.',
      created_at: '2024-03-05',
    }
  },
  {
    id: '4',
    title: 'El Principito',
    author: 'Antoine de Saint-Exupéry',
    url_cover: '/el-principito-cover.jpg',
    has_url_cover: true,
    start_read_date: '2024-02-10',
    end_read_date: '2024-02-12',
    review: {
      id: '4',
      book_id: '4',
      rating: 5,
      review_text: 'Un clásico atemporal que habla al corazón de lectores de todas las edades. Cada relectura revela nuevas profundidades.',
      created_at: '2024-02-28',
    }
  },
  {
    id: '5',
    title: 'Cien Años de Soledad',
    author: 'Gabriel García Márquez',
    url_cover: '/cien-a-os-de-soledad-cover.jpg',
    has_url_cover: true,
    start_read_date: '2024-01-20',
    end_read_date: '2024-02-05',
    review: {
      id: '5',
      book_id: '5',
      rating: 5,
      review_text: 'Una obra maestra del realismo mágico. La narrativa es rica, compleja y absolutamente cautivadora de principio a fin.',
      created_at: '2024-02-20',
    }
  },
  {
    id: '6',
    title: 'El Hobbit',
    author: 'J.R.R. Tolkien',
    url_cover: '/el-hobbit-cover.jpg',
    has_url_cover: true,
    start_read_date: '2024-01-05',
    end_read_date: '2024-01-25',
    review: {
      id: '6',
      book_id: '6',
      rating: 4,
      review_text: 'Una aventura encantadora que sienta las bases para El Señor de los Anillos. Perfecto para lectores de todas las edades.',
      created_at: '2024-02-10',
    }
  },
  {
    id: '7',
    title: 'Sapiens',
    author: 'Yuval Noah Harari',
    url_cover: '/sapiens-book-cover.png',
    has_url_cover: true,
    start_read_date: '2023-12-01',
    end_read_date: '2023-12-28',
    review: {
      id: '7',
      book_id: '7',
      rating: 5,
      review_text: 'Fascinante recorrido por la historia de la humanidad. Te hace repensar todo lo que creías saber sobre nuestra especie.',
      created_at: '2024-01-30',
    }
  },
  {
    id: '8',
    title: 'La Sombra del Viento',
    author: 'Carlos Ruiz Zafón',
    url_cover: '/la-sombra-del-viento-cover.jpg',
    has_url_cover: true,
    start_read_date: '2023-11-15',
    end_read_date: '2023-12-10',
    review: {
      id: '8',
      book_id: '8',
      rating: 5,
      review_text: 'Un thriller literario ambientado en la Barcelona de posguerra. Misterio, romance y una prosa exquisita.',
      created_at: '2024-01-15',
    }
  },
]

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

    const sortedMockBooks = [...mockBooks].sort((a, b) => {
      const dateA = new Date(a.review?.created_at || '').getTime()
      const dateB = new Date(b.review?.created_at || '').getTime()
      return dateB - dateA
    })

    const startIndex = page * PAGE_SIZE
    const endIndex = startIndex + PAGE_SIZE
    const pageItems = sortedMockBooks.slice(startIndex, endIndex)

    if (isFirstPage) {
      setBooks(pageItems)
    } else {
      setBooks(prev => [...prev, ...pageItems])
    }

    setHasMore(endIndex < sortedMockBooks.length)
    setCurrentPage(page)
    setUsingMockData(true)
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
