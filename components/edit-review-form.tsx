'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { StarRating } from '@/components/star-rating'
import { formatRating, isRated, parseRating } from '@/lib/rating'
import { TagPicker } from '@/components/tag-picker'
import { FormSaveBar } from '@/components/form-save-bar'
import { DraftBanner } from '@/components/draft-banner'
import {
  ArrowLeft,
  Loader2,
  Plus,
  X,
  BookOpen,
  ImagePlus,
  Upload,
  Pencil,
} from 'lucide-react'
import { API_BASE_URL, getApiHeaders, readApiError } from '@/lib/api-config'
import { goBackOr, replaceTo } from '@/lib/navigation'
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
  title: string
  author: string
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
  // Título y autor son del LIBRO, no de la reseña: los títulos vienen de la
  // importación de Goodreads y hay 15 con espacios de más en el título y 22 en
  // el autor. El backend los acepta como campos opcionales del mismo PUT.
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [editingIdentity, setEditingIdentity] = useState(false)
  const [rating, setRating] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [quotes, setQuotes] = useState<string[]>([])
  const [tags, setTags] = useState<TagSelection[]>([])
  const [importMessage, setImportMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ratingRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const authorRef = useRef<HTMLInputElement>(null)

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

    // `parseRating`: el backend puede mandar 4, 4.00 o 3.75; acá queda en cuartos.
    setRating(parseRating(data.rating))
    setReviewText(data.reviewText ?? '')
    setBook(data.book)
    setTitle(data.book.title)
    setAuthor(data.book.author)
    setStartDate(data.book.startReadDate?.slice(0, 10) || '')
    setEndDate(data.book.endReadDate?.slice(0, 10) || '')
    setCoverUrl(data.book.urlCover ?? '')
    setQuotes(initialQuotes)
    setTags(initialTags)

    setBaseline(
      JSON.stringify({
        title: data.book.title,
        author: data.book.author,
        rating: parseRating(data.rating),
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
    () => ({
      title,
      author,
      rating,
      reviewText,
      startDate,
      endDate,
      coverUrl,
      quotes,
      tags,
    }),
    [title, author, rating, reviewText, startDate, endDate, coverUrl, quotes, tags],
  )

  const dirty = baseline !== null && JSON.stringify(draftData) !== baseline

  const { pendingDrafts, savedAt, saveError, hasLiveWork, restore, discard, clear } =
    useFormDraft<EditReviewDraft>({
      storageKey: editReviewDraftKey(bookId),
      data: draftData,
      dirty,
      enabled: baseline !== null,
    })

  function handleRestoreDraft(id: string) {
    const restored = restore(id)
    if (!restored) return
    // Los borradores viejos (anteriores a poder editar el título) no traen
    // title/author: en ese caso se quedan los del libro.
    setTitle(restored.title ?? book?.title ?? '')
    setAuthor(restored.author ?? book?.author ?? '')
    setRating(parseRating(restored.rating))
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
  if (!title.trim()) missing.push('el título')
  if (!author.trim()) missing.push('el autor')
  if (rating === 0) missing.push('la calificación')

  // El backend corta en 255 (books.title es VARCHAR(255)) y devuelve un 400 con
  // el mensaje listo; esto es solo para avisar antes de que toque Guardar.
  const titleTooLong = title.trim().length > 255
  const authorTooLong = author.trim().length > 255

  const focusFirstMissing = useCallback(() => {
    if (!title.trim() || !author.trim() || titleTooLong || authorTooLong) {
      setEditingIdentity(true)
      // El campo recién existe después de abrir la sección.
      window.setTimeout(() => {
        const target =
          !title.trim() || titleTooLong ? titleRef.current : authorRef.current
        target?.focus()
        target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }, 0)
      return
    }
    ratingRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [author, authorTooLong, title, titleTooLong])

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

    if (!title.trim() || !author.trim() || rating === 0) {
      setSubmitError(null)
      focusFirstMissing()
      return
    }

    setSaving(true)
    setSubmitError(null)

    try {
      const payload = {
        // Campos del libro. El backend hace trim() y, si el par
        // (título, autor) ya existe en otro libro, contesta 409 con el mensaje
        // en castellano — que mostramos tal cual.
        title,
        author,
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
        // 409 (título+autor repetidos) o 400 (vacío / muy largo): el error es
        // de estos campos, así que los abrimos para que se puedan corregir.
        if (response.status === 409 || response.status === 400) {
          setEditingIdentity(true)
        }
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
      // `replace`: el formulario que se acaba de guardar no tiene por qué
      // quedar atrás en el historial.
      replaceTo(router, `/book/${bookId}`)
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
    author,
    bookId,
    clear,
    coverUrl,
    endDate,
    focusFirstMissing,
    initialTagSignature,
    quotes,
    rating,
    reviewText,
    router,
    saving,
    startDate,
    tags,
    title,
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
      <div className="flex items-center justify-center min-h-[60dvh]">
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
        <Button className="mt-6 h-11" onClick={() => replaceTo(router, '/')}>
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
    <div className="max-w-2xl mx-auto px-5 pt-6">
      {/* Back button + title */}
      <div className="flex items-center gap-3 mb-6">
        {/* Antes esto era un <Link>, o sea un PUSH: cada "volver" apilaba una
            pantalla y, contra el `back()` del detalle, armaba el bucle
            infinito entre detalle y edición. Ahora vuelve de verdad. */}
        <button
          type="button"
          onClick={() => goBackOr(router, `/book/${bookId}`)}
          aria-label="Volver al libro"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <PageTitle className="mb-0">Editar Reseña</PageTitle>
      </div>

      {pendingDrafts.map((draft) => (
        <DraftBanner
          key={draft.savedAt}
          savedAt={draft.savedAt}
          onRestore={() => handleRestoreDraft(draft.id)}
          onDiscard={() => discard(draft.id)}
          description={
            pendingDrafts.length > 1
              ? 'Uno de los borradores sin guardar que quedaron de este libro.'
              : 'Tenés cambios sin guardar de la última vez que editaste este libro.'
          }
          replaceWarning={
            hasLiveWork
              ? 'Los cambios que estás haciendo ahora se guardan solos, aparte de esto. Si recuperás este borrador, lo de la pantalla no se pierde: te lo vuelvo a ofrecer acá como otro borrador.'
              : null
          }
        />
      ))}

      {/* El <form> arranca ACÁ, envolviendo también la cabecera del libro:
          título, autor y tags son campos del libro y se guardan con el mismo
          botón que el resto. */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Cabecera del libro: portada, título, autor y tags. */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex gap-4 items-start">
              {displayCover ? (
                <img
                  src={displayCover}
                  alt={title || book.title}
                  className="w-14 h-20 object-cover rounded-md shadow-sm shrink-0"
                />
              ) : (
                <div className="w-14 h-20 bg-secondary rounded-md flex items-center justify-center shrink-0">
                  <BookOpen className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-lg leading-snug">
                  {title.trim() || 'Sin título'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {author.trim() || 'Sin autor'}
                </p>
              </div>
            </div>

            {/* Las dos acciones van abajo, a lo ancho de la card: en la columna
                de la derecha quedaban en 200px y el título perdía lugar. */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11"
                onClick={() => setEditingIdentity((prev) => !prev)}
                aria-expanded={editingIdentity}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Título y autor
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11"
                onClick={() => setEditingCover((prev) => !prev)}
                aria-expanded={editingCover}
              >
                <ImagePlus className="h-4 w-4 mr-2" />
                {displayCover ? 'Cambiar portada' : 'Agregar portada'}
              </Button>
            </div>

            {editingIdentity && (
              <div className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_title">Título del libro *</Label>
                  <Input
                    id="edit_title"
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Título del libro"
                    className="h-11 text-base"
                    aria-invalid={!title.trim() || titleTooLong}
                  />
                  {titleTooLong && (
                    <p className="text-[11px] text-destructive">
                      El título no puede superar los 255 caracteres (va{' '}
                      {title.trim().length}).
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_author">Autor *</Label>
                  <Input
                    id="edit_author"
                    ref={authorRef}
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Nombre del autor"
                    className="h-11 text-base"
                    aria-invalid={!author.trim() || authorTooLong}
                  />
                  {authorTooLong && (
                    <p className="text-[11px] text-destructive">
                      El autor no puede superar los 255 caracteres (va{' '}
                      {author.trim().length}).
                    </p>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Se guardan con el botón de abajo, junto con el resto de la reseña.
                  Los espacios de más se limpian solos.
                </p>
              </div>
            )}

            {editingCover && (
              <div className="space-y-1">
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

            {/* Tags: antes vivían adentro de "Detalles de la Reseña". Son del
                libro, no de la reseña, así que van en la cabecera — el mismo
                lugar donde se ven en el detalle. */}
            <TagPicker value={tags} onChange={setTags} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detalles de la Reseña</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Rating */}
            <div className="space-y-2" ref={ratingRef}>
              <Label id="edit-review-rating-label">Calificación *</Label>
              {/* Cuartos de estrella: tocar o deslizar. El número al lado es
                  el mismo formato que la hoja de la ficha ("3.75"). */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StarRating
                  rating={rating}
                  onRatingChange={setRating}
                  size="lg"
                  aria-labelledby="edit-review-rating-label"
                />
                <span className="text-base font-semibold tabular-nums text-muted-foreground">
                  {isRated(rating) ? formatRating(rating) : 'Sin calificar'}
                </span>
              </div>
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
          onCancel={() => goBackOr(router, `/book/${bookId}`)}
          draftSavedAt={savedAt}
          draftError={saveError}
          error={submitError}
        />
      </form>
    </div>
  )
}
