'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { StarRating } from '@/components/star-rating'
import { BookAutocomplete } from '@/components/book-autocomplete'
import { TagPicker } from '@/components/tag-picker'
import { FormSaveBar } from '@/components/form-save-bar'
import { DraftBanner } from '@/components/draft-banner'
import { Plus, X, BookOpen, ImagePlus, Upload } from 'lucide-react'
import { API_BASE_URL, getApiHeaders, readApiError } from '@/lib/api-config'
import { PageTitle } from '@/components/page-title'
import { mergeQuotes, parseKindleNotebookHtml } from '@/lib/quote-import'
import { saveBookTags, type TagSelection } from '@/lib/tags'
import { useFormDraft } from '@/hooks/use-form-draft'
import { newReviewDraftKey } from '@/lib/draft-storage'

const TIME_SUFFIX = process.env.NEXT_PUBLIC_TIME_SUFFIX || 'T21:00:00-03:00'

function toBackendDate(dateString: string | null): string | null {
  if (!dateString) return null
  return `${dateString}${TIME_SUFFIX}`
}

interface NewReviewFormData {
  title: string
  author: string
  urlCover: string
  startReadDate: string
  endReadDate: string
  rating: number
  reviewText: string
}

interface NewReviewDraft {
  formData: NewReviewFormData
  quotes: string[]
  tags: TagSelection[]
}

const EMPTY_FORM: NewReviewFormData = {
  title: '',
  author: '',
  urlCover: '',
  startReadDate: '',
  endReadDate: '',
  rating: 0,
  reviewText: '',
}

export function NewReviewForm() {
  const router = useRouter()

  const [formData, setFormData] = useState<NewReviewFormData>(EMPTY_FORM)
  const [quotes, setQuotes] = useState<string[]>([])
  const [tags, setTags] = useState<TagSelection[]>([])
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estado para edición manual de portada
  const [editingCover, setEditingCover] = useState(false)

  // Refs para mandar el foco al primer campo que falta.
  const titleRef = useRef<HTMLInputElement>(null)
  const authorRef = useRef<HTMLInputElement>(null)
  const ratingRef = useRef<HTMLDivElement>(null)

  // Si la reseña ya se creó pero fallaron los tags, guardamos el id para no
  // volver a crear el libro al reintentar.
  const createdBookIdRef = useRef<number | null>(null)

  // ---------------------------------------------------------------- borrador
  const draftData = useMemo<NewReviewDraft>(
    () => ({ formData, quotes, tags }),
    [formData, quotes, tags],
  )

  const dirty =
    JSON.stringify(draftData) !==
    JSON.stringify({ formData: EMPTY_FORM, quotes: [], tags: [] })

  const { pendingDraft, savedAt, restore, discard, clear } =
    useFormDraft<NewReviewDraft>({
      storageKey: newReviewDraftKey(),
      data: draftData,
      dirty,
    })

  function handleRestoreDraft() {
    const restored = restore()
    if (!restored) return
    setFormData({ ...EMPTY_FORM, ...restored.formData })
    setQuotes(restored.quotes ?? [])
    setTags(restored.tags ?? [])
  }

  // ------------------------------------------------------------------ quotes
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
      console.error('[NewReviewForm] Error importing quotes:', error)
      setImportMessage('No pude leer el archivo. Probá con la exportación HTML de Kindle.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ------------------------------------------------------------------ submit
  const missing: string[] = []
  if (!formData.title.trim()) missing.push('el título')
  if (!formData.author.trim()) missing.push('el autor')
  if (formData.rating === 0) missing.push('la calificación')

  const focusFirstMissing = useCallback(() => {
    if (!formData.title.trim()) {
      titleRef.current?.focus()
      titleRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    if (!formData.author.trim()) {
      authorRef.current?.focus()
      authorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    ratingRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [formData.author, formData.title])

  const submit = useCallback(async () => {
    if (loading) return

    if (!formData.title.trim() || !formData.author.trim() || formData.rating === 0) {
      setSubmitError(null)
      focusFirstMissing()
      return
    }

    setLoading(true)
    setSubmitError(null)

    try {
      const baseUrl = await API_BASE_URL

      let bookId = createdBookIdRef.current

      if (bookId === null) {
        const payload = {
          title: formData.title.trim(),
          author: formData.author.trim(),
          urlCover: formData.urlCover.trim(),
          startReadDate: toBackendDate(formData.startReadDate || null),
          endReadDate: toBackendDate(formData.endReadDate || null),
          rating: formData.rating,
          reviewText: formData.reviewText || null,
          quotes: quotes.map((q) => q.trim()).filter((q) => q.length > 0),
        }

        const response = await fetch(`${baseUrl}/reviews`, {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          setSubmitError(await readApiError(response, 'No pude guardar la reseña.'))
          return
        }

        const created = await response.json()
        bookId = created?.book?.id ?? null
        createdBookIdRef.current = bookId
      }

      if (bookId === null) {
        // Se guardó pero no sabemos el id: al menos no perdemos el borrador.
        setSubmitError(
          'Guardé la reseña pero el backend no devolvió el libro. Revisá la lista.',
        )
        return
      }

      if (tags.length > 0) {
        try {
          await saveBookTags(bookId, tags)
        } catch (error) {
          setSubmitError(
            `Guardé la reseña, pero no pude guardar los tags: ${
              error instanceof Error ? error.message : 'error desconocido'
            } Tocá Guardar de nuevo para reintentar solo los tags.`,
          )
          return
        }
      }

      clear()
      router.push(`/book/${bookId}`)
    } catch (error) {
      console.error('Error creating review:', error)
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'No pude conectarme al backend para guardar la reseña.',
      )
    } finally {
      setLoading(false)
    }
  }, [clear, focusFirstMissing, formData, loading, quotes, router, tags])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void submit()
  }

  // ⌘S / Ctrl+S en desktop
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void submitRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const displayCover = formData.urlCover || null

  return (
    <div className="max-w-2xl mx-auto px-5 py-6">
      <PageTitle subtitle="Agrega un libro a tu colección" className="mb-6">
        Nueva Reseña
      </PageTitle>

      {pendingDraft && (
        <DraftBanner
          savedAt={pendingDraft.savedAt}
          onRestore={handleRestoreDraft}
          onDiscard={discard}
          description="Tenés una reseña sin terminar de la última vez."
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card de info del libro */}
        <Card>
          <CardContent className="p-5 space-y-4">
            {/* Título: campo obligatorio, ancho completo */}
            <div className="space-y-2">
              <Label htmlFor="title">Título del Libro *</Label>
              <BookAutocomplete
                id="title"
                inputRef={titleRef}
                className="h-11 text-base"
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

            {/* Autor: campo obligatorio, ancho completo */}
            <div className="space-y-2">
              <Label htmlFor="author">Autor *</Label>
              <Input
                id="author"
                ref={authorRef}
                value={formData.author}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, author: e.target.value }))
                }
                required
                placeholder="Nombre del autor"
                className="h-11 text-base"
              />
            </div>

            {/* Portada: abajo de los campos obligatorios, no al lado.
                Antes la miniatura se comía la mitad del ancho y dejaba los dos
                campos obligatorios en 181px. */}
            <div className="flex items-center gap-3">
              {displayCover ? (
                <img
                  src={displayCover}
                  alt={formData.title || 'Portada del libro'}
                  className="w-12 h-[4.5rem] object-cover rounded-md shadow-sm shrink-0"
                />
              ) : (
                <div className="w-12 h-[4.5rem] bg-secondary rounded-md flex items-center justify-center shrink-0">
                  <BookOpen className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => setEditingCover((prev) => !prev)}
                aria-expanded={editingCover}
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                {displayCover ? 'Cambiar portada' : 'Agregar portada'}
              </Button>
            </div>

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
                  className="h-11 text-base"
                />
                <p className="text-[11px] text-muted-foreground">
                  Si completás este campo se usará esta imagen. Si lo dejás vacío, el
                  libro no tendrá portada personalizada.
                </p>
              </div>
            )}

            {/* Fechas */}
            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
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
                  className="h-11 text-base"
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
                  className="h-11 text-base"
                />
              </div>
            </div>

            {/* Rating */}
            <div className="space-y-2 w-full max-w-full" ref={ratingRef}>
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

        {/* Tags */}
        <Card className="bg-background">
          <CardContent className="p-5">
            <TagPicker value={tags} onChange={setTags} />
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
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-base font-semibold">
                    Frases favoritas del libro
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Guarda las frases que más te gustaron (opcional)
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
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
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addQuote}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar
                  </Button>
                </div>
              </div>

              {importMessage && (
                <p className="text-sm text-muted-foreground">{importMessage}</p>
              )}

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
                        className="flex-shrink-0 mt-1 h-11 w-11"
                        aria-label={`Borrar la frase ${index + 1}`}
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

        <FormSaveBar
          saveLabel="Guardar Reseña"
          missing={missing}
          saving={loading}
          onCancel={() => router.push('/')}
          draftSavedAt={savedAt}
          error={submitError}
        />
      </form>
    </div>
  )
}
