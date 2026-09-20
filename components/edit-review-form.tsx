'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StarRating } from '@/components/star-rating'
import { TagPicker } from '@/components/tag-picker'
import { FormSaveBar } from '@/components/form-save-bar'
import { DraftBanner } from '@/components/draft-banner'
import { ArrowLeft, Loader2, Plus, X, BookOpen, ImagePlus, Upload } from 'lucide-react'
import { API_BASE_URL, getApiHeaders, readApiError } from '@/lib/api-config'
import { PageTitle } from '@/components/page-title'
import { mergeQuotes, parseKindleNotebookHtml } from '@/lib/quote-import'
import { saveBookTags, toSelection, type BookTag, type TagSelection } from '@/lib/tags'
import { useFormDraft } from '@/hooks/use-form-draft'
import { editReviewDraftKey } from '@/lib/draft-storage'

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
    tags?: BookTag[]
  }
}

interface EditReviewDraft {
  rating: number
  reviewText: string
  startDate: string
  endDate: string
  coverUrl: string
  quotes: string[]
  tags: TagSelection[]
}

const TIME_SUFFIX = process.env.NEXT_PUBLIC_TIME_SUFFIX || 'T21:00:00-03:00'

function toBackendDate(dateString: string | null): string | null {
  if (!dateString) return null
  return `${dateString}${TIME_SUFFIX}`
}

function tagSignature(tags: TagSelection[]): string {
  return tags
    .map((t) => (t.id !== null ? `id:${t.id}` : `new:${t.slug}`))
    .sort()
    .join('|')
}

export function EditReviewForm({ bookId }: { bookId: string }) {
  const router = useRouter()

  const [book, setBook] = useState<ReviewResponse['book'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Form fields
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [quotes, setQuotes] = useState<string[]>([])
  const [tags, setTags] = useState<TagSelection[]>([])
  const [importMessage, setImportMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ratingRef = useRef<HTMLDivElement>(null)

  // URL portada
  const [coverUrl, setCoverUrl] = useState('')
  const [editingCover, setEditingCover] = useState(false)

  // Snapshot de lo que vino del backend, para saber si hay cambios sin guardar.
  const [baseline, setBaseline] = useState<string | null>(null)

  useEffect(() => {
    fetchReview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  async function fetchReview() {
    try {
      const baseUrl = await API_BASE_URL
      const response = await fetch(`${baseUrl}/reviews/book/${bookId}`, {
        headers: getApiHeaders(),
      })

      if (!response.ok) {
        setLoadError(await readApiError(response, 'No pude traer la reseña.'))
        return
      }

      const data: ReviewResponse = await response.json()
      populateForm(data)
    } catch (error) {
      console.error('[EditReview] Error fetching review:', error)
      setLoadError(
        error instanceof Error
          ? error.message
          : 'No pude conectarme al backend para traer la reseña.',
      )
    } finally {
      setLoading(false)
    }
  }

  function populateForm(data: ReviewResponse) {
    const initialTags = (data.book.tags ?? []).map(toSelection)
    const initialQuotes =
      data.quotes && Array.isArray(data.quotes)
        ? data.quotes.map((q) => q.quoteText)
        : []

    setRating(data.rating)
    setReviewText(data.reviewText ?? '')
    setBook(data.book)
    setStartDate(data.book.startReadDate?.slice(0, 10) || '')
    setEndDate(data.book.endReadDate?.slice(0, 10) || '')
    setCoverUrl(data.book.urlCover ?? '')
    setQuotes(initialQuotes)
    setTags(initialTags)

    setBaseline(
      JSON.stringify({
        rating: data.rating,
        reviewText: data.reviewText ?? '',
        startDate: data.book.startReadDate?.slice(0, 10) || '',
        endDate: data.book.endReadDate?.slice(0, 10) || '',
        coverUrl: data.book.urlCover ?? '',
        quotes: initialQuotes,
        tags: initialTags,
      } satisfies EditReviewDraft),
    )
  }

  // ---------------------------------------------------------------- borrador
  const draftData = useMemo<EditReviewDraft>(
    () => ({ rating, reviewText, startDate, endDate, coverUrl, quotes, tags }),
    [rating, reviewText, startDate, endDate, coverUrl, quotes, tags],
  )

  const dirty = baseline !== null && JSON.stringify(draftData) !== baseline

  const { pendingDraft, savedAt, restore, discard, clear } =
    useFormDraft<EditReviewDraft>({
      storageKey: editReviewDraftKey(bookId),
      data: draftData,
      dirty,
      enabled: baseline !== null,
    })

  function handleRestoreDraft() {
    const restored = restore()
    if (!restored) return
    setRating(restored.rating ?? 0)
    setReviewText(restored.reviewText ?? '')
    setStartDate(restored.startDate ?? '')
    setEndDate(restored.endDate ?? '')
    setCoverUrl(restored.coverUrl ?? '')
    setQuotes(restored.quotes ?? [])
    setTags(restored.tags ?? [])
  }

  // ------------------------------------------------------------------ quotes
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

  // ------------------------------------------------------------------ submit
  const missing: string[] = []
  if (rating === 0) missing.push('la calificación')

  const initialTagSignature = useMemo(() => {
    if (!baseline) return ''
    try {
      return tagSignature((JSON.parse(baseline) as EditReviewDraft).tags ?? [])
    } catch {
      return ''
    }
  }, [baseline])

  const submit = useCallback(async () => {
    if (saving) return

    if (rating === 0) {
      setSubmitError(null)
      ratingRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }

    setSaving(true)
    setSubmitError(null)

    try {
      const payload = {
        rating,
        reviewText: reviewText || null,
        startReadDate: toBackendDate(startDate || null),
        endReadDate: toBackendDate(endDate || null),
        // siempre mandamos el array (aunque vacío)
        quotes: quotes.map((q) => q.trim()).filter((q) => q.length > 0),
        // 🔹 SIEMPRE mandamos urlCover (vacía o no)
        urlCover: coverUrl.trim(),
      }

      const baseUrl = await API_BASE_URL
      const response = await fetch(`${baseUrl}/reviews/book/${bookId}`, {
        method: 'PUT',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        // Antes esto se tragaba el error y navegaba igual, así que un guardado
        // fallido parecía exitoso.
        setSubmitError(await readApiError(response, 'No pude guardar los cambios.'))
        return
      }

      if (tagSignature(tags) !== initialTagSignature) {
        try {
          await saveBookTags(bookId, tags)
        } catch (error) {
          setSubmitError(
            `Guardé la reseña, pero no pude guardar los tags: ${
              error instanceof Error ? error.message : 'error desconocido'
            }`,
          )
          return
        }
      }

      clear()
      router.push(`/book/${bookId}`)
    } catch (error) {
      console.error('[EditReview] Error updating review:', error)
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'No pude conectarme al backend para guardar los cambios.',
      )
    } finally {
      setSaving(false)
    }
  }, [
    bookId,
    clear,
    coverUrl,
    endDate,
    initialTagSignature,
    quotes,
    rating,
    reviewText,
    router,
    saving,
    startDate,
    tags,
  ])

  function handleSubmit(e: React.FormEvent) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!book) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-10 text-center">
        <p className="font-medium text-foreground">No se encontró la reseña</p>
        {loadError && (
          <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
        )}
        <Button className="mt-6 h-11" onClick={() => router.push('/')}>
          Volver a mis reseñas
        </Button>
      </div>
    )
  }

  // para la preview usamos primero lo que está editando el usuario
  const displayCover =
    coverUrl ||
    book.urlCover ||
    (book.b64Cover ? `data:image/png;base64,${book.b64Cover}` : null)

  return (
    <div className="max-w-2xl mx-auto px-5 py-6">
      {/* Back button + title */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href={`/book/${bookId}`}
          aria-label="Volver al libro"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <PageTitle className="mb-0">Editar Reseña</PageTitle>
      </div>

      {pendingDraft && (
        <DraftBanner
          savedAt={pendingDraft.savedAt}
          onRestore={handleRestoreDraft}
          onDiscard={discard}
          description="Tenés cambios sin guardar de la última vez que editaste este libro."
        />
      )}

      {/* Book Info Card */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex gap-4 items-start">
            {displayCover ? (
              <img
                src={displayCover}
                alt={book.title}
                className="w-14 h-20 object-cover rounded-md shadow-sm shrink-0"
              />
            ) : (
              <div className="w-14 h-20 bg-secondary rounded-md flex items-center justify-center shrink-0">
                <BookOpen className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-lg leading-snug">{book.title}</h2>
              <p className="text-sm text-muted-foreground">{book.author}</p>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-11"
                onClick={() => setEditingCover((prev) => !prev)}
                aria-expanded={editingCover}
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                {displayCover ? 'Cambiar portada' : 'Agregar portada'}
              </Button>
            </div>
          </div>

          {editingCover && (
            <div className="mt-4 space-y-1">
              <Label htmlFor="coverUrl" className="text-xs text-muted-foreground">
                URL de la portada
              </Label>
              <Input
                id="coverUrl"
                type="url"
                placeholder="https://ejemplo.com/portada.jpg"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                className="h-11 text-base"
              />
              <p className="text-[11px] text-muted-foreground">
                Si completás este campo se actualizará la imagen de portada del libro. Si lo
                dejás vacío, se eliminará.
              </p>
            </div>
          )}
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
            <div className="space-y-2" ref={ratingRef}>
              <Label>Calificación *</Label>
              <StarRating rating={rating} onRatingChange={setRating} size="lg" />
            </div>

            {/* Dates */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_start_date">Fecha de inicio</Label>
                <Input
                  id="edit_start_date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_end_date">Fecha de fin</Label>
                <Input
                  id="edit_end_date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11 text-base"
                />
              </div>
            </div>

            {/* Tags */}
            <TagPicker value={tags} onChange={setTags} />

            {/* Review Text */}
            <div className="space-y-2">
              <Label htmlFor="edit_review">Tu reseña</Label>
              <Textarea
                id="edit_review"
                className="min-h-[300px] max-h-[55vh] overflow-y-auto text-base leading-relaxed resize-y"
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
                  className="h-11 w-11"
                  aria-label={`Borrar la frase ${index + 1}`}
                  onClick={() => removeQuote(index)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <FormSaveBar
          saveLabel="Guardar Cambios"
          missing={missing}
          saving={saving}
          onCancel={() => router.push(`/book/${bookId}`)}
          draftSavedAt={savedAt}
          error={submitError}
        />
      </form>
    </div>
  )
}
