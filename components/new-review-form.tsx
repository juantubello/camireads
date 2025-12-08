'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { StarRating } from '@/components/star-rating'
import { BookAutocomplete } from '@/components/book-autocomplete'
import { Plus, X, BookOpen, Pencil, Loader2 } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api-config'
import { PageTitle } from '@/components/page-title'

const TIME_SUFFIX = process.env.NEXT_PUBLIC_TIME_SUFFIX || 'T21:00:00-03:00'

function toBackendDate(dateString: string | null): string | null {
  if (!dateString) return null
  return `${dateString}${TIME_SUFFIX}`
}

export function NewReviewForm() {
  const router = useRouter()

  const [formData, setFormData] = useState({
    title: '',
    author: '',
    urlCover: '',
    startReadDate: '',
    endReadDate: '',
    rating: 0,
    reviewText: '',
  })

  const [quotes, setQuotes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  // Estado para edición manual de portada
  const [editingCover, setEditingCover] = useState(false)

  const addQuote = () => {
    setQuotes((prev) => [...prev, ''])
  }

  const updateQuote = (index: number, value: string) => {
    setQuotes((prev) => {
      const copy = [...prev]
      copy[index] = value
      return copy
    })
  }

  const removeQuote = (index: number) => {
    setQuotes((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const payload = {
        title: formData.title,
        author: formData.author,
        urlCover: formData.urlCover.trim(),
        startReadDate: toBackendDate(formData.startReadDate || null),
        endReadDate: toBackendDate(formData.endReadDate || null),
        rating: formData.rating,
        reviewText: formData.reviewText || null,
        quotes: quotes.map((q) => q.trim()).filter((q) => q.length > 0),
      }

      const response = await fetch(`${API_BASE_URL}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        console.error('Error creando reseña:', await response.text())
        return
      }

      const created = await response.json()
      // el backend devuelve Review con el Book adentro
      if (created.book && created.book.id) {
        router.push(`/book/${created.book.id}`)
      } else {
        router.push('/')
      }
    } catch (error) {
      console.error('Error creating review:', error)
    } finally {
      setLoading(false)
    }
  }

  const displayCover = formData.urlCover || null

  return (
    <div className="max-w-2xl mx-auto px-5 py-6">
      <PageTitle subtitle="Agrega un libro a tu colección" className="mb-6">
        Nueva Reseña
      </PageTitle>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card de info del libro + portada */}
        <Card>
          <CardContent className="p-5 space-y-4">
            {/* Portada + lápiz */}
            <div className="flex gap-4 items-start px-4 md:px-0">
              <div className="relative">
                {displayCover ? (
                  <img
                    src={displayCover}
                    alt={formData.title || 'Portada del libro'}
                    className="w-16 h-24 object-cover rounded-md shadow-sm"
                  />
                ) : (
                  <div className="w-16 h-24 bg-secondary rounded-md flex items-center justify-center">
                    <BookOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setEditingCover((prev) => !prev)}
                  className="absolute -right-2 -bottom-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background shadow border border-border hover:bg-muted transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 min-w-0 space-y-3">
                {/* Título con autocomplete */}
                <div className="space-y-2">
                  <Label htmlFor="title">Título del Libro *</Label>
                  <BookAutocomplete
                    value={formData.title}
                    onValueChange={(title) =>
                      setFormData((prev) => ({ ...prev, title }))
                    }
                    onBookSelect={(book) =>
                      setFormData((prev) => ({
                        ...prev,
                        title: book.title,
                        author: book.author,
                        urlCover: book.cover_url || '',
                      }))
                    }
                  />
                </div>

                {/* Autor */}
                <div className="space-y-2">
                  <Label htmlFor="author">Autor *</Label>
                  <Input
                    id="author"
                    value={formData.author}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, author: e.target.value }))
                    }
                    required
                    placeholder="Nombre del autor"
                  />
                </div>

                {/* Campo URL manual de portada */}
                {editingCover && (
                  <div className="space-y-1">
                    <Label htmlFor="coverUrl" className="text-xs text-muted-foreground">
                      URL de la portada
                    </Label>
                    <Input
                      id="coverUrl"
                      type="url"
                      placeholder="https://ejemplo.com/portada.jpg"
                      value={formData.urlCover}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, urlCover: e.target.value }))
                      }
                      className="h-9 text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Si completás este campo se usará esta imagen. Si lo dejás vacío, el
                      libro no tendrá portada personalizada.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Fechas + rating */}
            <div className="space-y-4">
              <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4 px-4 md:px-0">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Fecha de Inicio</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.startReadDate}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        startReadDate: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_date">Fecha de Fin</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.endReadDate}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        endReadDate: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label>Calificación *</Label>
                <StarRating
                  rating={formData.rating}
                  onRatingChange={(rating) =>
                    setFormData((prev) => ({ ...prev, rating }))
                  }
                  size="lg"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reseña */}
        <Card className="bg-background">
          <CardContent className="p-5">
            <div className="space-y-2">
              <Label htmlFor="review" className="text-base font-semibold">
                Tu Reseña
              </Label>
              <p className="text-sm text-muted-foreground mb-3">
                Comparte tus pensamientos y reflexiones sobre este libro
              </p>
              <Textarea
                id="review"
                value={formData.reviewText}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    reviewText: e.target.value,
                  }))
                }
                rows={16}
                placeholder="Escribe aquí tu reseña..."
                className="min-h-[400px] text-base leading-relaxed resize-y"
              />
            </div>
          </CardContent>
        </Card>

        {/* Frases favoritas */}
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

        <Button
          type="submit"
          className="w-full h-12 text-base font-semibold flex items-center justify-center"
          disabled={
            loading ||
            !formData.title ||
            !formData.author ||
            formData.rating === 0
          }
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Guardando...
            </>
          ) : (
            'Guardar Reseña'
          )}
        </Button>

      </form>
    </div>
  )
}
