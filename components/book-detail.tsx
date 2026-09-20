'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StarRating } from '@/components/star-rating'
import { TagChip } from '@/components/tag-chip'
import { Book, Review } from '@/lib/types'
import type { BookTag } from '@/lib/tags'
import { ArrowLeft, Edit, Trash2, Loader2, Copy, Check, AlertCircle } from 'lucide-react'
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
import { API_BASE_URL, getApiHeaders, readApiError } from '@/lib/api-config'
import { buildReviewTextForAi } from '@/lib/review-export'
import { cn } from '@/lib/utils'

interface BookWithReview extends Book {
  review?: Review
  tags?: BookTag[]
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
    tags?: BookTag[]
  }
  quotes?: {
    id: number
    quoteText: string
    createdAt: string
  }[]
}

// Mapper: de la response del backend a tu BookWithReview del front
function mapApiReviewToBookWithReview(api: ReviewFromApi): BookWithReview {
  const { book } = api

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    start_read_date: book.startReadDate ?? undefined,
    end_read_date: book.endReadDate ?? undefined,
    created_at: book.createdAt,
    has_url_cover: book.hasUrlCover,
    url_cover: book.urlCover ?? undefined,
    b64_cover: book.b64Cover ?? undefined,
    tags: book.tags ?? [],
    review: {
      id: api.id,
      book_id: book.id,
      rating: api.rating,
      review_text: api.reviewText,
      created_at: api.createdAt,
      quotes: api.quotes?.map((q) => q.quoteText) ?? [],
    },
  }
}

function stripHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
}

const MONTHS_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

/**
 * Formatea una fecha del backend (OffsetDateTime) en corto: "26 ago 2026".
 * Toma los primeros 10 caracteres del ISO a propósito: así la fecha no se
 * corre un día si el navegador está en otro huso horario.
 */
function formatShortDate(iso?: string): string | null {
  if (!iso) return null
  const match = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match
  const monthName = MONTHS_SHORT[Number(month) - 1] ?? month
  return `${Number(day)} ${monthName} ${year}`
}

/**
 * "Imperio de sombra y tormento (Bilogia Hikari #1)" ->
 *   { main: "Imperio de sombra y tormento", series: "Bilogia Hikari #1" }
 * Solo separa cuando el paréntesis final parece una saga; si no, no toca nada.
 */
export function splitSeriesFromTitle(title: string): {
  main: string
  series: string | null
} {
  const match = title.trim().match(/^(.*\S)\s*\(([^()]+)\)$/)
  if (!match) return { main: title, series: null }

  const inner = match[2].trim()
  const looksLikeSeries = /#|\bsagas?\b|bilog|trilog|tetralog|duolog|\bseries?\b|\bserie\b|\bvol\.?\b/i.test(
    inner,
  )

  if (!looksLikeSeries) return { main: title, series: null }
  return { main: match[1], series: inner }
}

/** Cuántas frases se muestran antes de pedir "ver todas". */
const QUOTES_PREVIEW = 3

export function BookDetail({ bookId }: { bookId: string }) {
  const router = useRouter()
  const [book, setBook] = useState<BookWithReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isReviewExpanded, setIsReviewExpanded] = useState(false)
  const [areQuotesExpanded, setAreQuotesExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [copiedForAi, setCopiedForAi] = useState(false)

  useEffect(() => {
    fetchBook()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  async function fetchBook() {
    try {
      const baseUrl = await API_BASE_URL
      const response = await fetch(`${baseUrl}/reviews/book/${bookId}`, {
        headers: getApiHeaders(),
      })

      if (!response.ok) {
        setLoadError(await readApiError(response, 'No pude traer este libro.'))
        return
      }

      const data: ReviewFromApi = await response.json()
      const mapped = mapApiReviewToBookWithReview(data)
      setBook(mapped)
    } catch (error) {
      console.error('[BookDetail] Error fetching book:', error)
      setLoadError(
        error instanceof Error
          ? error.message
          : 'No pude conectarme al backend para traer este libro.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true)
      setDeleteError(null)

      const baseUrl = await API_BASE_URL
      const resp = await fetch(`${baseUrl}/reviews/book/${bookId}`, {
        method: 'DELETE',
        headers: getApiHeaders(),
      })

      if (!resp.ok && resp.status !== 204) {
        setDeleteError(await readApiError(resp, 'No pude eliminar el libro.'))
        return
      }

      router.push('/')
    } catch (error) {
      console.error('[BookDetail] Error deleting review:', error)
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'No pude conectarme al backend para eliminar el libro.',
      )
    } finally {
      setDeleting(false)
    }
  }

  async function handleCopyForAi() {
    if (!book) return

    const text = buildReviewTextForAi({
      title: book.title,
      author: book.author,
      rating: book.review?.rating,
      reviewText: book.review?.review_text,
      quotes: book.review?.quotes,
    })

    try {
      await navigator.clipboard.writeText(text)
      setCopiedForAi(true)
      window.setTimeout(() => setCopiedForAi(false), 2200)
    } catch (error) {
      console.error('[BookDetail] Error copying review for AI:', error)
    }
  }

  const isReviewLong = (html: string) => {
    const text = stripHtml(html)
    return text.length > 300 || text.split('\n').length > 5
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
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="font-medium text-foreground">Libro no encontrado</p>
        {loadError && <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>}
        <Button className="mt-6 h-11" onClick={() => router.push('/')}>
          Volver a mis reseñas
        </Button>
      </div>
    )
  }

  const hasReviewText = Boolean(book.review?.review_text?.trim())
  const quotes = book.review?.quotes ?? []
  const tags = book.tags ?? []
  const { main: mainTitle, series } = splitSeriesFromTitle(book.title)
  const startDate = formatShortDate(book.start_read_date)
  const endDate = formatShortDate(book.end_read_date)

  const quotesLabel = quotes.length === 1 ? '1 frase' : `${quotes.length} frases`
  const visibleQuotes = areQuotesExpanded ? quotes : quotes.slice(0, QUOTES_PREVIEW)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Volver"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>

        <h1 className="text-2xl font-bold">Detalles del Libro</h1>
      </header>

      <div className="space-y-6">
        {/* Book Cover & Info */}
        <Card>
          <CardContent className="p-5 md:p-6 space-y-5">
            <div className="flex gap-4 md:gap-6">
              {book.url_cover || book.b64_cover ? (
                <img
                  src={book.url_cover || `data:image/png;base64,${book.b64_cover}`}
                  alt={`Portada de ${book.title}`}
                  className="w-24 h-36 md:w-32 md:h-44 object-cover rounded-lg shadow-md flex-shrink-0"
                />
              ) : (
                <div className="w-24 h-36 md:w-32 md:h-44 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                  <BookOpen className="h-10 w-10 text-muted-foreground" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                {/* La parte de la saga va en su propio renglón y más chica:
                    antes el título entero envolvía en 5 líneas. */}
                <h2 className="text-xl md:text-2xl font-bold leading-tight text-balance">
                  {mainTitle}
                </h2>
                {series && (
                  <p className="mt-1 text-sm text-muted-foreground">{series}</p>
                )}

                <p className="mt-2 text-base text-muted-foreground">{book.author}</p>

                {book.review && (
                  <div className="mt-3">
                    <StarRating rating={book.review.rating} size="md" readonly />
                  </div>
                )}
              </div>
            </div>

            {/* Tags del libro */}
            {tags.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Tags del libro">
                {tags.map((tag) => (
                  <li key={tag.id}>
                    <TagChip tag={tag} />
                  </li>
                ))}
              </ul>
            )}

            {/* Fechas, compactas y en una sola línea */}
            {(startDate || endDate) && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                {startDate && endDate ? (
                  <>
                    <span className="font-medium text-foreground">Leído:</span>
                    <span>
                      {startDate} → {endDate}
                    </span>
                  </>
                ) : startDate ? (
                  <>
                    <span className="font-medium text-foreground">Iniciado:</span>
                    <span>{startDate}</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">Terminado:</span>
                    <span>{endDate}</span>
                  </>
                )}
              </p>
            )}

            {/* Acciones seguras, en una sola fila */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1 min-w-[8.5rem]"
                onClick={handleCopyForAi}
              >
                {copiedForAi ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar para IA
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                className="h-11 flex-1 min-w-[8.5rem]"
                onClick={() => router.push(`/edit/${bookId}`)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar Reseña
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Reseña: visible por defecto. Es el producto de la app. */}
        {hasReviewText && book.review?.review_text && (
          <Card>
            <CardContent className="p-5 md:p-6">
              <h3 className="text-lg font-semibold">Mi Reseña</h3>

              <div className="mt-3 space-y-3">
                <div
                  className={cn(
                    'relative',
                    !isReviewExpanded &&
                      isReviewLong(book.review.review_text) &&
                      'max-h-[8.5rem] overflow-hidden',
                  )}
                >
                  <div
                    className="text-foreground leading-relaxed whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: book.review.review_text }}
                  />

                  {!isReviewExpanded && isReviewLong(book.review.review_text) && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent"
                    />
                  )}
                </div>

                {isReviewLong(book.review.review_text) && (
                  <Button
                    variant="ghost"
                    className="h-11 px-3 -ml-3 text-primary"
                    aria-expanded={isReviewExpanded}
                    onClick={() => setIsReviewExpanded((expanded) => !expanded)}
                  >
                    {isReviewExpanded ? 'Ver menos' : 'Seguir leyendo'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Favorite Quotes */}
        {quotes.length > 0 && (
          <Card className="bg-secondary/30">
            <CardContent className="p-5 md:p-6">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                Frases Favoritas ✨
              </h3>
              <p className="text-sm text-muted-foreground">
                {quotesLabel} guardadas de este libro.
              </p>

              <div className="mt-4 space-y-4">
                {visibleQuotes.map((quote, index) => (
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

              {quotes.length > QUOTES_PREVIEW && (
                <Button
                  variant="outline"
                  className="mt-4 h-11 w-full sm:w-auto"
                  aria-expanded={areQuotesExpanded}
                  onClick={() => setAreQuotesExpanded((expanded) => !expanded)}
                >
                  {areQuotesExpanded
                    ? `Ver solo ${QUOTES_PREVIEW}`
                    : `Ver las ${quotes.length} frases`}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Zona de riesgo: separada de las acciones seguras y con etiqueta. */}
        <section
          aria-labelledby="zona-peligro"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-5"
        >
          <h3 id="zona-peligro" className="font-semibold text-foreground">
            Eliminar este libro
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Se borra el libro, su reseña
            {quotes.length > 0 ? ` y sus ${quotesLabel}` : ''}. No se puede deshacer.
          </p>

          {deleteError && (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 text-sm font-medium text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{deleteError}</span>
            </p>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="mt-3 h-11 w-full sm:w-auto"
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Eliminar libro
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿Eliminar &ldquo;{mainTitle}&rdquo;?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-left">
                    <p>Se va a borrar para siempre:</p>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>el libro y su ficha</li>
                      {hasReviewText && (
                        <li>
                          tu reseña (
                          {stripHtml(book.review?.review_text ?? '').length.toLocaleString(
                            'es-AR',
                          )}{' '}
                          caracteres)
                        </li>
                      )}
                      {quotes.length > 0 && <li>sus {quotesLabel} favoritas</li>}
                      {tags.length > 0 && (
                        <li>
                          y se desvincula de {tags.length === 1 ? 'su tag' : `sus ${tags.length} tags`}
                        </li>
                      )}
                    </ul>
                    <p className="font-medium text-foreground">No se puede deshacer.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting} className="h-11">
                  Mejor no
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault()
                    void handleDelete()
                  }}
                  disabled={deleting}
                  className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Sí, eliminar todo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
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
      aria-hidden="true"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}
