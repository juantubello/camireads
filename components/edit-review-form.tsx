'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StarRating } from '@/components/star-rating'
import { ArrowLeft, Loader2, Save, Plus, X } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api-config'
import { Book, Review } from '@/lib/types'
import { PageTitle } from '@/components/page-title'

interface BookWithReview extends Book {
  review?: Review
}

const mockBook: BookWithReview = {
  id: 1,
  title: 'La Biblioteca de la Medianoche',
  author: 'Matt Haig',
  url_cover: '/midnight-library-book-cover.jpg',
  has_url_cover: true,
  start_read_date: '2024-01-01',
  end_read_date: '2024-01-15',
  created_at: '2024-01-15',
  review: {
    id: 1,
    book_id: 1,
    rating: 5,
    review_text: 'Una hermosa exploración de las decisiones de la vida y los universos paralelos. Me encantó cada página.',
    created_at: '2024-01-15',
    quotes: ['Nunca subestimes el gran poder del arrepentimiento.']
  }
}

export function EditReviewForm({ bookId }: { bookId: string }) {
  const router = useRouter()
  const [book, setBook] = useState<BookWithReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Form state
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [quotes, setQuotes] = useState<string[]>([])
  
  const addQuote = () => {
    setQuotes([...quotes, ''])
  }
  
  const updateQuote = (index: number, value: string) => {
    const newQuotes = [...quotes]
    newQuotes[index] = value
    setQuotes(newQuotes)
  }
  
  const removeQuote = (index: number) => {
    setQuotes(quotes.filter((_, i) => i !== index))
  }
  
  useEffect(() => {
    fetchBook()
  }, [bookId])
  
  async function fetchBook() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/books/${bookId}`)
      
      if (!response.ok) {
        throw new Error('Backend API not available')
      }
      
      const data = await response.json()
      setBook(data)
      populateForm(data)
    } catch (error) {
      console.log('[v0] Backend API not available, using mock data for preview')
      setBook(mockBook)
      populateForm(mockBook)
    } finally {
      setLoading(false)
    }
  }
  
  function populateForm(bookData: BookWithReview) {
    if (bookData.review) {
      setRating(bookData.review.rating)
      setReviewText(bookData.review.review_text || '')
      setQuotes(bookData.review.quotes || [])
    }
    setStartDate(bookData.start_read_date || '')
    setEndDate(bookData.end_read_date || '')
  }
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    
    try {
      const payload = {
        rating,
        review_text: reviewText,
        start_read_date: startDate || null,
        end_read_date: endDate || null,
        quotes: quotes.filter(q => q.trim() !== ''),
      }
      
      await fetch(`${API_BASE_URL}/api/books/${bookId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      
      router.push(`/book/${bookId}`)
    } catch (error) {
      console.error('[v0] Error updating review:', error)
      router.push(`/book/${bookId}`)
    } finally {
      setSaving(false)
    }
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
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/book/${bookId}`} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <PageTitle className="mb-0">
          Editar Reseña
        </PageTitle>
      </div>
      
      {/* Book Info Card */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex gap-4 items-center">
            {book.url_cover || book.b64_cover ? (
              <img
                src={book.url_cover || `data:image/png;base64,${book.b64_cover}`}
                alt={book.title}
                className="w-16 h-24 object-cover rounded-md shadow-sm flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-24 bg-secondary rounded-md flex items-center justify-center flex-shrink-0">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-lg line-clamp-2">{book.title}</h2>
              <p className="text-sm text-muted-foreground">{book.author}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Edit Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalles de la Reseña</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Rating */}
            <div className="space-y-2">
              <Label>Calificación *</Label>
              <StarRating rating={rating} onRatingChange={setRating} size="lg"/>
            </div>
            
            {/* Reading Dates */}
            <div className="space-y-4 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-4">
              <div className="space-y-2 w-full max-w-full px-4 sm:px-0">
                <Label htmlFor="startDate">Fecha de inicio</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full max-w-full"
                />
              </div>
              
              <div className="space-y-2 w-full max-w-full px-4 sm:px-0">
                <Label htmlFor="endDate">Fecha de finalización</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full max-w-full"
                />
              </div>
            </div>
            
            {/* Review Text */}
            <div className="space-y-2">
              <Label htmlFor="review">Tu Reseña</Label>
              <Textarea
                id="review"
                placeholder="¿Qué te pareció este libro? Comparte tus pensamientos, personajes favoritos, momentos memorables..."
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                className="min-h-[400px] text-base leading-relaxed resize-y"
              />
            </div>
          </CardContent>
        </Card>
        
        {/* Favorite Quotes section */}
        <Card className="bg-background">
          <CardContent className="p-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base font-semibold">
                    Frases favoritas del libro
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Guarda las frases que más te gustaron (opcional)
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addQuote}
                  className="flex-shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </div>
              
              {quotes.length > 0 && (
                <div className="space-y-3">
                  {quotes.map((quote, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <Textarea
                        value={quote}
                        onChange={(e) => updateQuote(index, e.target.value)}
                        placeholder={`Frase ${index + 1}...`}
                        className="min-h-[80px] text-sm resize-y"
                        rows={3}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeQuote(index)}
                        className="flex-shrink-0 mt-1"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-12"
            onClick={() => router.push(`/book/${bookId}`)}
            disabled={saving}
          >
            Cancelar
          </Button>
          
          <Button
            type="submit"
            className="flex-1 h-12"
            disabled={saving || rating === 0}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar Cambios
              </>
            )}
          </Button>
        </div>
      </form>
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
