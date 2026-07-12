'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StarRating } from '@/components/star-rating'
import { ArrowLeft, Loader2, Save, Plus, X, BookOpen, Pencil, Upload } from 'lucide-react'
import { API_BASE_URL, getApiHeaders } from '@/lib/api-config'
import { PageTitle } from '@/components/page-title'
import { mergeQuotes, parseKindleNotebookHtml } from '@/lib/quote-import'

interface ReviewQuoteResponse {
  id: number
  quoteText: string
  createdAt: string
}

interface ReviewResponse {
  id: number
  rating: number
  reviewText: string
  createdAt: string
  quotes: ReviewQuoteResponse[]
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

const TIME_SUFFIX = process.env.NEXT_PUBLIC_TIME_SUFFIX || 'T21:00:00-03:00'

function toBackendDate(dateString: string | null): string | null {
  if (!dateString) return null
  return `${dateString}${TIME_SUFFIX}`
}

export function EditReviewForm({ bookId }: { bookId: string }) {
  const router = useRouter()

  const [book, setBook] = useState<ReviewResponse['book'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form fields
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [quotes, setQuotes] = useState<string[]>([])
  const [importMessage, setImportMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // URL portada
  const [coverUrl, setCoverUrl] = useState('')
  const [editingCover, setEditingCover] = useState(false)

  useEffect(() => {
    fetchReview()
  }, [bookId])

  async function fetchReview() {
    try {
      const baseUrl = await API_BASE_URL;  
      const response = await fetch(`${baseUrl}/reviews/book/${bookId}`, {
        headers: getApiHeaders(),
      })

      if (!response.ok) throw new Error('Review not found')

      const data: ReviewResponse = await response.json()
      populateForm(data)
    } catch (error) {
      console.error('[EditReview] Error fetching review:', error)
    } finally {
      setLoading(false)
    }
  }

  function populateForm(data: ReviewResponse) {
    // REVIEW
    setRating(data.rating)
    setReviewText(data.reviewText ?? '')

    // BOOK
    setBook(data.book)

    setStartDate(data.book.startReadDate?.slice(0, 10) || '')
    setEndDate(data.book.endReadDate?.slice(0, 10) || '')

    // Portada
    setCoverUrl(data.book.urlCover ?? '')

    // QUOTES → convert objects to simple strings
    if (data.quotes && Array.isArray(data.quotes)) {
      setQuotes(data.quotes.map((q) => q.quoteText))
    } else {
      setQuotes([])
    }
  }

  const addQuote = () => setQuotes([...quotes, ''])

  const updateQuote = (index: number, value: string) => {
    const updated = [...quotes]
    updated[index] = value
    setQuotes(updated)
  }

  const removeQuote = (index: number) =>
    setQuotes(quotes.filter((_, i) => i !== index))

  async function handleImportQuotes(file: File | null) {
    if (!file) return

    try {
      const html = await file.text()
      const imported = parseKindleNotebookHtml(html)

      if (imported.quotes.length === 0) {
        setImportMessage('No encontré subrayados para importar en este archivo.')
        return
      }

      setQuotes((prev) => mergeQuotes(prev, imported.quotes))
      setImportMessage(`Importé ${imported.quotes.length} subrayados del archivo.`)
    } catch (error) {
      console.error('[EditReview] Error importing quotes:', error)
      setImportMessage('No pude leer el archivo. Probá con la exportación HTML de Kindle.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const payload: any = {
        rating,
        reviewText: reviewText || null,
        startReadDate: toBackendDate(startDate || null),
        endReadDate: toBackendDate(endDate || null),
        // siempre mandamos el array (aunque vacío)
        quotes: quotes.map((q) => q.trim()).filter((q) => q.length > 0),
        // 🔹 SIEMPRE mandamos urlCover (vacía o no)
        urlCover: coverUrl.trim(),
      }
      const baseUrl = await API_BASE_URL;  
      await fetch(`${baseUrl}/reviews/book/${bookId}`, {
        method: 'PUT',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })

      router.push(`/book/${bookId}`)
    } catch (error) {
      console.error('[EditReview] Error updating review:', error)
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
        <p className="text-muted-foreground">No se encontró la reseña</p>
      </div>
    )
  }

  // para la preview usamos primero lo que está editando el usuario
  const displayCover =
    coverUrl ||
    book.urlCover ||
    (book.b64Cover ? `data:image/png;base64,${book.b64Cover}` : null)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Back button + title */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <PageTitle className="mb-0">Editar Reseña</PageTitle>
      </div>

      {/* Book Info Card */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex gap-4 items-start">
            <div className="relative">
              {displayCover ? (
                <img
                  src={displayCover}
                  alt={book.title}
                  className="w-16 h-24 object-cover rounded-md shadow-sm"
                />
              ) : (
                <div className="w-16 h-24 bg-secondary rounded-md flex items-center justify-center">
                  <BookOpen className="h-8 w-8 text-muted-foreground" />
                </div>
              )}

              {/* Botón lápiz para editar URL de portada */}
              <button
                type="button"
                onClick={() => setEditingCover((prev) => !prev)}
                className="absolute -right-2 -bottom-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background shadow border border-border hover:bg-muted transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-lg line-clamp-2">{book.title}</h2>
              <p className="text-sm text-muted-foreground">{book.author}</p>

              {/* Campo URL de portada */}
              {editingCover && (
                <div className="mt-3 space-y-1">
                  <Label htmlFor="coverUrl" className="text-xs text-muted-foreground">
                    URL de la portada
                  </Label>
                  <Input
                    id="coverUrl"
                    type="url"
                    placeholder="https://ejemplo.com/portada.jpg"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Si completás este campo se actualizará la imagen de portada del libro. Si lo
                    dejás vacío, se eliminará.
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalles de la Reseña</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Rating */}
            <div className="space-y-2">
              <Label>Calificación *</Label>
              <StarRating rating={rating} onRatingChange={setRating} size="lg" />
            </div>

            {/* Dates */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha de inicio</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Fecha de fin</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>

            {/* Review Text */}
            <div className="space-y-2">
              <Label>Tu reseña</Label>
              <Textarea
                className="min-h-[300px]"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Quotes */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between items-center gap-3">
              <Label className="font-semibold">Frases Favoritas</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,text/html"
                  className="hidden"
                  onChange={(event) => handleImportQuotes(event.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Importar Kindle
                </Button>
                <Button
                  type="button"               // 👈 IMPORTANTE: que NO sea submit
                  variant="outline"
                  size="sm"
                  onClick={addQuote}
                >
                  <Plus className="h-4 w-4 mr-1" /> Agregar
                </Button>
              </div>
            </div>

            {importMessage && (
              <p className="text-sm text-muted-foreground">{importMessage}</p>
            )}

            {quotes.map((quote, index) => (
              <div key={index} className="flex gap-2">
                <Textarea
                  value={quote}
                  onChange={(e) => updateQuote(index, e.target.value)}
                  placeholder={`Frase ${index + 1}...`}
                  className="min-h-[80px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeQuote(index)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Buttons */}
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
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-5 w-5 mr-2" />
                Guardar Cambios
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
