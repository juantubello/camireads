'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StarRating } from '@/components/star-rating'
import { Book, Review } from '@/lib/types'
import { ArrowLeft, Edit, Trash2, Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { API_BASE_URL } from '@/lib/api-config'

interface BookWithReview extends Book {
  review?: Review
}

// Tipo que refleja EXACTAMENTE lo que devuelve tu backend
type ReviewFromApi = {
  id: number
  rating: number
  reviewText: string
  createdAt: string
  book: {
    id: number
    title: string
    author: string
    startReadDate?: string | null
    endReadDate?: string | null
    createdAt: string
    hasUrlCover: boolean
    urlCover?: string | null
    b64Cover?: string | null
  }
  quotes?: {
    id: number
    quoteText: string
    createdAt: string
  }[]
}

const mockBook: BookWithReview = {
  id: '1',
  title: 'La Biblioteca de la Medianoche',
  author: 'Matt Haig',
  url_cover: '/midnight-library-book-cover.jpg',
  has_url_cover: true,
  start_read_date: '2024-01-01',
  end_read_date: '2024-01-15',
  created_at: '2024-01-01',
  review: {
    id: '1',
    book_id: '1',
    rating: 5,
    review_text:
      'Una hermosa exploración de las decisiones de la vida y los universos paralelos. Me encantó cada página. La protagonista, Nora, se encuentra en un lugar entre la vida y la muerte donde puede experimentar todas las vidas que podría haber vivido si hubiera tomado decisiones diferentes. Es profundamente conmovedor y filosófico.',
    created_at: '2024-01-15',
    quotes: [
      'Nunca subestimes el gran poder del arrepentimiento.',
      'Entre la vida y la muerte hay una biblioteca, y dentro de esa biblioteca, las estanterías llegan hasta el infinito.',
    ],
  },
}

// Mapper: de la response del backend a tu BookWithReview del front
function mapApiReviewToBookWithReview(api: ReviewFromApi): BookWithReview {
  const { book } = api

  return {
    // campos de Book (types.ts)
    id: book.id,
    title: book.title,
    author: book.author,
    start_read_date: book.startReadDate ?? undefined,
    end_read_date: book.endReadDate ?? undefined,
    created_at: book.createdAt, // fecha de creación del libro
    has_url_cover: book.hasUrlCover,
    url_cover: book.urlCover ?? undefined,
    b64_cover: book.b64Cover ?? undefined,

    // campo extra review
    review: {
      id: api.id,
      book_id: book.id,
      rating: api.rating,
      review_text: api.reviewText,
      created_at: api.createdAt,
      // transformamos [{ quoteText }] -> string[]
      quotes: api.quotes?.map((q) => q.quoteText) ?? [],
    },
  }
}

function stripHtml(html: string): string {
  if (!html) return ''
  // Reemplazamos <br> por saltos de línea y sacamos el resto de tags
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
}

export function BookDetail({ bookId }: { bookId: string }) {
  const router = useRouter()
  const [book, setBook] = useState<BookWithReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [isReviewExpanded, setIsReviewExpanded] = useState(false)

  useEffect(() => {
    fetchBook()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  async function fetchBook() {
    try {
      // ahora apuntamos al endpoint de reviews por bookId
      const response = await fetch(`${API_BASE_URL}/reviews/book/${bookId}`)

      if (!response.ok) {
        throw new Error('Backend API not available')
      }

      const data: ReviewFromApi = await response.json()
      const mapped = mapApiReviewToBookWithReview(data)
      setBook(mapped)
    } catch (error) {
      console.log('[v0] Backend API not available, using mock data for preview')
      setBook(mockBook)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    try {
      // si tenés endpoint de borrado distinto, lo ajustás acá
      await fetch(`${API_BASE_URL}/api/books/${bookId}`, { method: 'DELETE' })
      router.push('/')
    } catch (error) {
      console.error('[v0] Error deleting book:', error)
      router.push('/')
    }
  }

  const isReviewLong = (html: string) => {
    const text = stripHtml(html)
    return text.length > 300 || text.split('\n').length > 5
  }

  const getTruncatedReview = (html: string) => {
    const text = stripHtml(html)
    if (text.length <= 300) return text
    return text.substring(0, 300) + '...'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!book) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Libro no encontrado</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        {/* 🔙 ANTES: <Link href="/" ...> */}
        <button
          type="button"
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>

        <h1 className="text-2xl font-bold">Detalles del Libro</h1>
      </header>

      <div className="space-y-6">
        {/* Book Cover & Info */}
        <Card>
          <CardContent className="p-6">
            <div className="flex gap-6">
              {book.url_cover || book.b64_cover ? (
                <img
                  src={book.url_cover || `data:image/png;base64,${book.b64_cover}`}
                  alt={book.title}
                  className="w-32 h-44 object-cover rounded-lg shadow-md flex-shrink-0"
                />
              ) : (
                <div className="w-32 h-44 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                  <BookOpen className="h-12 w-12 text-muted-foreground" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold mb-2 text-balance">{book.title}</h2>
                <p className="text-lg text-muted-foreground mb-4">{book.author}</p>

                {book.review && (
                  <StarRating rating={book.review.rating} size="md" readonly />
                )}

                {(book.start_read_date || book.end_read_date) && (
                  <div className="mt-4 space-y-1 text-sm">
                    {book.start_read_date && (
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Iniciado:</span>{' '}
                        {new Date(book.start_read_date).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    )}
                    {book.end_read_date && (
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Terminado:</span>{' '}
                        {new Date(book.end_read_date).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Favorite Quotes */}
        {book.review?.quotes && book.review.quotes.length > 0 && (
          <Card className="bg-secondary/30">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                Frases Favoritas ✨
              </h3>
              <div className="space-y-4">
                {book.review.quotes.map((quote, index) => (
                  <div
                    key={index}
                    className="bg-background/60 border border-border/50 rounded-lg p-4 shadow-sm"
                  >
                    <p className="italic text-foreground/90 leading-relaxed">
                      &ldquo;{quote}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Review */}
        {book.review?.review_text && (
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-3">Mi Reseña</h3>
              <div className="space-y-3">
                {isReviewExpanded || !isReviewLong(book.review.review_text) ? (
                  // Versión completa con <br/> interpretado
                  <div
                    className="text-foreground leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: book.review.review_text }}
                  />
                ) : (
                  // Versión truncada, sin HTML
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                    {getTruncatedReview(book.review.review_text)}
                  </p>
                )}

                {isReviewLong(book.review.review_text) && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsReviewExpanded(!isReviewExpanded)}
                      className="text-sm text-primary hover:underline font-medium"
                    >
                      {isReviewExpanded ? 'Ver menos' : 'Ver más'}
                    </button>

                    {!isReviewExpanded && (
                      <>
                        <span className="text-muted-foreground text-sm">•</span>
                        <button
                          onClick={() => setIsReviewExpanded(true)}
                          className="text-sm text-primary hover:underline font-medium"
                        >
                          Ver reseña completa
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 h-12"
            onClick={() => router.push(`/edit/${bookId}`)}
          >
            <Edit className="h-4 w-4 mr-2" />
            Editar Reseña
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="flex-1 h-12">
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar este libro?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esto eliminará permanentemente &ldquo;{book.title}&rdquo; y su reseña. Esta
                  acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
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
