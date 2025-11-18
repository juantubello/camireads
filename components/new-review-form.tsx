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
import { ArrowLeft, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { API_BASE_URL } from '@/lib/api-config'
import { PageTitle } from '@/components/page-title'

export function NewReviewForm() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    url_cover: '',
    start_read_date: '',
    end_read_date: '',
    rating: 0,
    review_text: '',
  })
  const [quotes, setQuotes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  
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
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const bookResponse = await fetch(`${API_BASE_URL}/api/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          author: formData.author,
          url_cover: formData.url_cover,
          has_url_cover: !!formData.url_cover,
          start_read_date: formData.start_read_date || null,
          end_read_date: formData.end_read_date || null,
        }),
      })
      
      const book = await bookResponse.json()
      
      await fetch(`${API_BASE_URL}/api/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_id: book.id,
          rating: formData.rating,
          review_text: formData.review_text,
          quotes: quotes.filter(q => q.trim() !== ''),
        }),
      })
      
      router.push('/')
    } catch (error) {
      console.error('Error creating review:', error)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="max-w-2xl mx-auto px-5 py-6">
      <PageTitle subtitle="Agrega un libro a tu colección" className="mb-6">
        Nueva Reseña
      </PageTitle>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-2 w-full max-w-full px-4 md:px-0">
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
                    url_cover: book.cover_url || '',
                  }))
                }
              />
            </div>
            
            <div className="space-y-2 w-full max-w-full px-4 md:px-0">
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
            
            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label htmlFor="start_date">Fecha de Inicio</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_read_date}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      start_read_date: e.target.value,
                    }))
                  }
                  className="w-full max-w-full"
                />
              </div>
              
              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label htmlFor="end_date">Fecha de Fin</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_read_date}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      end_read_date: e.target.value,
                    }))
                  }
                  className="w-full max-w-full"
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
          </CardContent>
        </Card>
        
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
                value={formData.review_text}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    review_text: e.target.value,
                  }))
                }
                rows={16}
                placeholder="Escribe aquí tu reseña..."
                className="min-h-[400px] text-base leading-relaxed resize-y"
              />
            </div>
          </CardContent>
        </Card>
        
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
          className="w-full h-12 text-base font-semibold"
          disabled={loading || !formData.title || !formData.author || formData.rating === 0}
        >
          {loading ? 'Guardando...' : 'Guardar Reseña'}
        </Button>
      </form>
    </div>
  )
}
