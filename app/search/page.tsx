'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  Search,
  Book,
  ChevronDown,
  Check,
  Loader2,
  Tag as TagIcon,
  X,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { StarRating } from '@/components/star-rating'
import { PageTitle } from '@/components/page-title'
import { TagChip } from '@/components/tag-chip'
import { cn } from '@/lib/utils'
import { fetchTags, tagColor, type BookTag, type Tag } from '@/lib/tags'
import { API_BASE_URL, getApiHeaders } from '@/lib/api-config'

const TIME_SUFFIX = process.env.NEXT_PUBLIC_TIME_SUFFIX || 'T21:00:00-03:00'
// De "T21:00:00-03:00" me quedo con el offset "-03:00"
const TZ_OFFSET = TIME_SUFFIX.slice(-6)

/** Cuántos chips de tag se ven en cada resultado antes del "+N". */
const MAX_VISIBLE_TAGS = 2

/**
 * Cómo se combinan varios tags. El backend lo llama `any` / `all`, pero eso NO
 * se muestra nunca: la diferencia (113 libros vs 23) es enorme y la UI la tiene
 * que explicar en castellano.
 */
type TagMode = 'any' | 'all'

// Tipo de lo que devuelve el backend en /reviews
type ReviewSearchResult = {
  id: number
  rating: number
  reviewText: string
  createdAt: string
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
    tags?: BookTag[] | null
  }
}

type StoredSearchFilters = {
  authorFilter: string
  bookNameFilter: string
  startDate: string
  endDate: string
  ratingFilter: number | null
  tagIds?: number[]
  tagMode?: TagMode
}

const STORAGE_KEY = 'camireads_search_reviews_filters'

function toReadFrom(date: string): string {
  // 2025-11-15 -> 2025-11-15T00:00:00-03:00
  return `${date}T00:00:00${TZ_OFFSET}`
}

function toReadTo(date: string): string {
  // 2025-11-25 -> 2025-11-25T23:59:59-03:00
  return `${date}T23:59:59${TZ_OFFSET}`
}

/** Acepta `?tagIds=11,12` y `?tagIds=11&tagIds=12`, como el backend. */
function parseTagIdsFromUrl(search: string): number[] {
  const params = new URLSearchParams(search)
  const ids = params
    .getAll('tagIds')
    .flatMap((value) => value.split(','))
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0)

  return Array.from(new Set(ids))
}

function sanitizeTagIds(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value.filter(
        (id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0,
      ),
    ),
  )
}

export default function SearchPage() {
  const [authorFilter, setAuthorFilter] = useState('')
  const [bookNameFilter, setBookNameFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [ratingFilter, setRatingFilter] = useState<number | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])
  const [tagMode, setTagMode] = useState<TagMode>('any')

  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [tagsLoading, setTagsLoading] = useState(true)
  const [tagsError, setTagsError] = useState<string | null>(null)
  const [tagSheetOpen, setTagSheetOpen] = useState(false)

  const [results, setResults] = useState<ReviewSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Filtros abiertos por defecto
  const [showFilters, setShowFilters] = useState(true)

  // Flag para disparar búsqueda automática al volver a la página
  const [shouldAutoSearch, setShouldAutoSearch] = useState(false)

  const hasActiveFilters =
    authorFilter !== '' ||
    bookNameFilter !== '' ||
    startDate !== '' ||
    endDate !== '' ||
    ratingFilter !== null ||
    selectedTagIds.length > 0

  // Los tags elegidos, resueltos contra /tags. Si todavía no cargaron (o el id
  // vino por URL y ya no existe) simplemente no hay chip que mostrar.
  const selectedTags = useMemo(
    () =>
      selectedTagIds
        .map((id) => availableTags.find((tag) => tag.id === id))
        .filter((tag): tag is Tag => Boolean(tag)),
    [selectedTagIds, availableTags],
  )

  // Resumen de lo que está filtrando ahora mismo, para verlo con el panel cerrado.
  const activeFilterLabels = useMemo(() => {
    const labels: string[] = []
    if (bookNameFilter.trim()) labels.push(`Libro: ${bookNameFilter.trim()}`)
    if (authorFilter.trim()) labels.push(`Autor: ${authorFilter.trim()}`)
    if (ratingFilter !== null) labels.push(`${ratingFilter}★`)
    if (startDate) labels.push(`Desde ${startDate}`)
    if (endDate) labels.push(`Hasta ${endDate}`)
    if (selectedTagIds.length > 0) {
      const names =
        selectedTags.length > 0
          ? selectedTags.map((tag) => tag.name).join(', ')
          : `${selectedTagIds.length} tags`
      labels.push(
        selectedTagIds.length > 1 && tagMode === 'all'
          ? `Tags (todos): ${names}`
          : `Tags: ${names}`,
      )
    }
    return labels
  }, [
    bookNameFilter,
    authorFilter,
    ratingFilter,
    startDate,
    endDate,
    selectedTagIds,
    selectedTags,
    tagMode,
  ])

  // 🏷️ Los tags disponibles, con su bookCount (saber que "Favoritos" tiene 55
  // libros antes de filtrar evita filtrar a ciegas).
  useEffect(() => {
    const controller = new AbortController()

    fetchTags(controller.signal)
      .then((tags) => {
        setAvailableTags(tags)
        setTagsError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setTagsError(
          error instanceof Error ? error.message : 'No pude traer los tags.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setTagsLoading(false)
      })

    return () => controller.abort()
  }, [])

  // 🧠 Al montar, leo filtros guardados (NO resultados).
  // Si la URL trae ?tagIds=... (se llegó tocando un tag) manda la URL.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const urlTagIds = parseTagIdsFromUrl(window.location.search)
    if (urlTagIds.length > 0) {
      const urlMode = new URLSearchParams(window.location.search).get('tagMode')
      setSelectedTagIds(urlTagIds)
      setTagMode(urlMode === 'all' ? 'all' : 'any')
      setShouldAutoSearch(true)
      setShowFilters(true)
      return
    }

    const saved = window.sessionStorage.getItem(STORAGE_KEY)
    if (!saved) return

    try {
      const parsed: StoredSearchFilters = JSON.parse(saved)
      const savedTagIds = sanitizeTagIds(parsed.tagIds)

      setAuthorFilter(parsed.authorFilter || '')
      setBookNameFilter(parsed.bookNameFilter || '')
      setStartDate(parsed.startDate || '')
      setEndDate(parsed.endDate || '')
      setRatingFilter(
        typeof parsed.ratingFilter === 'number' ? parsed.ratingFilter : null
      )
      setSelectedTagIds(savedTagIds)
      setTagMode(parsed.tagMode === 'all' ? 'all' : 'any')

      // Si había algún filtro, marco que hay que buscar automáticamente
      if (
        parsed.authorFilter ||
        parsed.bookNameFilter ||
        parsed.startDate ||
        parsed.endDate ||
        parsed.ratingFilter !== null ||
        savedTagIds.length > 0
      ) {
        setShouldAutoSearch(true)
        setShowFilters(true)
      }
    } catch (e) {
      console.error('Error reading saved search filters', e)
    }
  }, [])

  // Cuando debería hacer búsqueda automática y ya tengo filtros en estado
  useEffect(() => {
    if (!shouldAutoSearch) return
    handleSearch().finally(() => setShouldAutoSearch(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoSearch])

  async function handleSearch() {
    setLoading(true)
    setHasSearched(true)

    try {
      const params = new URLSearchParams()

      if (authorFilter.trim() !== '') {
        params.append('author', authorFilter.trim())
      }
      if (bookNameFilter.trim() !== '') {
        params.append('bookTitle', bookNameFilter.trim())
      }
      if (ratingFilter !== null) {
        params.append('rating', String(ratingFilter))
      }

      if (startDate) {
        params.append('readFrom', toReadFrom(startDate))
      }
      if (endDate) {
        params.append('readTo', toReadTo(endDate))
      }

      if (selectedTagIds.length > 0) {
        params.append('tagIds', selectedTagIds.join(','))
        // Con un solo tag el modo no cambia nada; lo mando solo si hay 2 o más.
        if (selectedTagIds.length > 1) {
          params.append('tagMode', tagMode)
        }
      }

      const baseUrl = await API_BASE_URL;
      const url = `${baseUrl}/reviews?${params.toString()}`
      const response = await fetch(url, { headers: getApiHeaders() })

      if (!response.ok) {
        throw new Error(`Error ${response.status} al buscar reseñas`)
      }

      const data: ReviewSearchResult[] = await response.json()
      setResults(data)

      // En mobile la barra de filtros mide casi una pantalla entera: si queda
      // abierta después de buscar, tapa los resultados. La cierro y dejo a la
      // vista el resumen de filtros activos (con "Limpiar" al lado).
      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 767px)').matches
      ) {
        setShowFilters(false)
        window.scrollTo({ top: 0 })
      }

      // 💾 Guardo SOLO los filtros, no los resultados
      if (typeof window !== 'undefined') {
        const toStore: StoredSearchFilters = {
          authorFilter,
          bookNameFilter,
          startDate,
          endDate,
          ratingFilter,
          tagIds: selectedTagIds,
          tagMode,
        }
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
      }
    } catch (error) {
      console.error('[SearchPage] Error buscando reseñas:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const clearFilters = () => {
    setAuthorFilter('')
    setBookNameFilter('')
    setStartDate('')
    setEndDate('')
    setRatingFilter(null)
    setSelectedTagIds([])
    setTagMode('any')
    setResults([])
    setHasSearched(false)

    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(STORAGE_KEY)
      // Si se llegó por ?tagIds=..., saco el query para que recargar no lo reviva.
      if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }

  const toggleTag = (id: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((tagId) => tagId !== id) : [...prev, id],
    )
  }

  const effectiveMessage =
    !hasSearched && !hasActiveFilters
      ? {
          icon: <Search className="h-12 w-12 text-muted-foreground mb-4" />,
          title: 'Usá los filtros para buscar en tus reseñas',
          subtitle: 'Podés combinar autor, libro, fecha, calificación y tags',
        }
      : results.length === 0
      ? {
          icon: <Book className="h-12 w-12 text-muted-foreground mb-4" />,
          title: 'No se encontraron reseñas',
          subtitle: 'Probá ajustando los filtros de búsqueda',
        }
      : null

  return (
    <div className="min-h-screen bg-background pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:pb-10 md:pt-16">
      {/* En desktop la barra de filtros se pega debajo del header fijo (64px).
          El `max-h` es la red de seguridad: con todos los filtros abiertos la
          barra mide ~757px y en un iPhone chico (o con el teclado abierto) el
          botón "Buscar" quedaba abajo del borde y, al estar pegada, nunca
          subía. Con el tope la barra scrollea sola y todo sigue alcanzable.
          En desktop nunca llega al tope, así que no aparece ninguna barra. */}
      <div className="sticky top-0 md:top-16 z-10 bg-background border-b border-border max-h-[calc(100dvh_-_4.5rem_-_env(safe-area-inset-bottom))] md:max-h-[calc(100dvh_-_4rem)] overflow-y-auto">
        <div className="px-5 py-4 md:max-w-5xl xl:max-w-6xl md:mx-auto md:px-6">
          <PageTitle className="mb-4">Buscar Reseñas</PageTitle>

          {/* Filtros colapsables (abiertos por defecto) */}
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <div className="flex items-center gap-1">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 min-h-11 justify-between text-sm text-muted-foreground hover:text-foreground"
                >
                  <span className="flex items-center gap-2">
                    Filtros
                    {activeFilterLabels.length > 0 && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-foreground">
                        {activeFilterLabels.length}{' '}
                        {activeFilterLabels.length === 1 ? 'activo' : 'activos'}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      showFilters ? 'rotate-180' : ''
                    }`}
                  />
                </Button>
              </CollapsibleTrigger>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="min-h-11 shrink-0 text-sm text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>

            {/* Con el panel cerrado no se ve ningún control: acá va el resumen
                de lo que está filtrando. Con el panel abierto sobra, porque
                cada control muestra su propio estado. */}
            {!showFilters && activeFilterLabels.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 px-1 pb-1">
                {activeFilterLabels.map((label) => (
                  <li
                    key={label}
                    className="max-w-full truncate rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            )}

            <CollapsibleContent className="space-y-4 pt-4">
              {/* Nombre del libro */}
              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label htmlFor="book-name" className="text-sm font-medium">
                  Nombre del Libro
                </Label>
                <Input
                  id="book-name"
                  type="text"
                  placeholder="Filtrar por título del libro..."
                  value={bookNameFilter}
                  onChange={(e) => setBookNameFilter(e.target.value)}
                  className="bg-secondary/30 border-border"
                />
              </div>

              {/* Nombre del autor */}
              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label htmlFor="author" className="text-sm font-medium">
                  Nombre del Autor
                </Label>
                <Input
                  id="author"
                  type="text"
                  placeholder="Filtrar por autor..."
                  value={authorFilter}
                  onChange={(e) => setAuthorFilter(e.target.value)}
                  className="bg-secondary/30 border-border"
                />
              </div>

              {/* Rango de fechas de lectura */}
              <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 md:gap-4">
                <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                  <Label htmlFor="start-date" className="text-sm font-medium">
                    Fecha de Inicio
                  </Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-secondary/30 border-border w-full max-w-full"
                  />
                </div>
                <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                  <Label htmlFor="end-date" className="text-sm font-medium">
                    Fecha de Fin
                  </Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-secondary/30 border-border w-full max-w-full"
                  />
                </div>
              </div>

              {/* Calificación */}
              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label className="text-sm font-medium">Calificación</Label>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={ratingFilter === null ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRatingFilter(null)}
                    className="flex-1 min-w-[70px]"
                  >
                    Todas
                  </Button>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <Button
                      key={rating}
                      variant={ratingFilter === rating ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRatingFilter(rating)}
                      className="flex-1 min-w-[60px]"
                    >
                      {rating}★
                    </Button>
                  ))}
                </div>
              </div>

              {/* Tags. El listado vive en un sheet: la barra de filtros es
                  sticky y a 375px no puede crecer más que la pantalla. */}
              <div className="space-y-2 w-full max-w-full px-4 md:px-0">
                <Label className="text-sm font-medium">Tags</Label>
                <Button
                  type="button"
                  variant="outline"
                  aria-haspopup="dialog"
                  onClick={() => setTagSheetOpen(true)}
                  className="w-full min-h-11 justify-between gap-2 bg-secondary/30 px-3 font-normal"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <TagIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {selectedTagIds.length === 0
                        ? 'Elegir tags'
                        : selectedTags.length > 0
                          ? selectedTags.map((tag) => tag.name).join(', ')
                          : `${selectedTagIds.length} tags elegidos`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {tagsLoading ? 'Cargando…' : `${availableTags.length} disponibles`}
                  </span>
                </Button>

                {selectedTagIds.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {tagMode === 'any'
                      ? 'Libros con alguno de estos tags.'
                      : `Libros que tengan los ${selectedTagIds.length} tags a la vez.`}
                  </p>
                )}

                {tagsError && (
                  <p className="text-xs text-destructive">{tagsError}</p>
                )}
              </div>

              {/* Botón de buscar. "Limpiar" ya no vive acá: subió al encabezado
                  del panel, así también está a mano con los filtros cerrados. */}
              <div className="flex flex-col sm:flex-row gap-2 px-4 md:px-0 pt-2">
                <Button
                  size="sm"
                  className="min-h-11 w-full"
                  onClick={handleSearch}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Search className="h-4 w-4 mr-2 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Buscar
                    </>
                  )}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Sheet de tags: entra desde abajo, que es donde llega el pulgar. */}
      <Sheet open={tagSheetOpen} onOpenChange={setTagSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] gap-0 rounded-t-2xl p-0 md:mx-auto md:max-w-lg"
        >
          <SheetHeader className="border-b border-border pr-12 text-left">
            <SheetTitle>Filtrar por tags</SheetTitle>
            <SheetDescription>
              Elegí uno o varios. Al lado de cada uno dice cuántos libros tiene.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {tagsLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando tags…
              </div>
            ) : tagsError ? (
              <p className="px-3 py-6 text-sm text-destructive">{tagsError}</p>
            ) : availableTags.length === 0 ? (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                Todavía no hay tags. Se crean al editar un libro.
              </p>
            ) : (
              <ul>
                {availableTags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id)
                  return (
                    <li key={tag.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleTag(tag.id)}
                        className={cn(
                          'flex w-full min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                          selected ? 'bg-accent' : 'hover:bg-accent/50',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: tagColor(tag) }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {tag.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {tag.bookCount ?? 0}{' '}
                          {tag.bookCount === 1 ? 'libro' : 'libros'}
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border',
                          )}
                        >
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* El modo recién importa con 2 tags o más. */}
          {selectedTagIds.length > 1 && (
            <div className="space-y-2 border-t border-border px-4 py-3">
              <p id="tag-mode-label" className="text-sm font-medium">
                ¿Cómo combino los tags?
              </p>
              <div
                role="radiogroup"
                aria-labelledby="tag-mode-label"
                className="grid grid-cols-2 gap-2"
              >
                {(
                  [
                    { value: 'any' as const, label: 'Con alguno de estos' },
                    { value: 'all' as const, label: 'Con todos estos' },
                  ]
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={tagMode === option.value}
                    onClick={() => setTagMode(option.value)}
                    className={cn(
                      'min-h-11 rounded-lg border px-3 py-2 text-sm leading-tight transition-colors',
                      tagMode === option.value
                        ? 'border-primary bg-primary text-primary-foreground font-medium'
                        : 'border-border bg-secondary/30 hover:bg-accent/50',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {tagMode === 'any'
                  ? `Alcanza con que el libro tenga uno de los ${selectedTagIds.length} tags.`
                  : `Solo los libros que tengan los ${selectedTagIds.length} tags juntos. Son muchos menos.`}
              </p>
            </div>
          )}

          <SheetFooter className="flex-row gap-2 border-t border-border pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
            <Button
              variant="outline"
              className="flex-1 min-h-11"
              onClick={() => setSelectedTagIds([])}
              disabled={selectedTagIds.length === 0}
            >
              Quitar tags
            </Button>
            <Button
              className="flex-1 min-h-11"
              onClick={() => {
                setTagSheetOpen(false)
                handleSearch()
              }}
              disabled={loading}
            >
              <Search className="h-4 w-4 mr-2" />
              Buscar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <div className="px-5 py-6 md:max-w-5xl xl:max-w-6xl md:mx-auto md:px-6">
        {effectiveMessage ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {effectiveMessage.icon}
            <p className="text-muted-foreground">{effectiveMessage.title}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {effectiveMessage.subtitle}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              {results.length}{' '}
              {results.length === 1 ? 'resultado' : 'resultados'} encontrado
              {results.length === 1 ? '' : 's'}
            </p>

            {/* Mobile: lista vertical. Desktop: grilla 2 col (md) / 3 col (xl). */}
            <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-4">
            {results.map((review) => {
              const book = review.book
              const coverUrl =
                book.urlCover ||
                (book.b64Cover ? `data:image/png;base64,${book.b64Cover}` : '/placeholder.svg')

              const dateRead =
                book.endReadDate || book.startReadDate || review.createdAt

              const shortReview =
                review.reviewText.length > 200
                  ? review.reviewText.slice(0, 200) + '...'
                  : review.reviewText

              return (
                <Link
                  key={review.id}
                  href={`/book/${book.id}`}
                  className="block bg-card rounded-lg p-4 border border-border hover:border-primary/50 transition-all hover:shadow-sm"
                >
                  <div className="flex gap-4">
                    <img
                      src={coverUrl}
                      alt={book.title}
                      className="w-16 h-24 object-cover rounded shadow-sm flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-serif font-semibold text-foreground line-clamp-1">
                        {book.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {book.author}
                      </p>
                      <StarRating rating={review.rating} size="sm" readonly />
                      {shortReview && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {shortReview}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-2">
                        Leído el{' '}
                        {new Date(dateRead).toLocaleDateString('es-ES')}
                      </p>

                      {book.tags && book.tags.length > 0 && (
                        <ul
                          className="flex flex-wrap items-center gap-1 mt-2"
                          aria-label={`Tags: ${book.tags
                            .map((tag) => tag.name)
                            .join(', ')}`}
                        >
                          {book.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                            <li key={tag.id}>
                              <TagChip tag={tag} size="xs" />
                            </li>
                          ))}
                          {book.tags.length > MAX_VISIBLE_TAGS && (
                            <li className="text-[11px] text-muted-foreground">
                              +{book.tags.length - MAX_VISIBLE_TAGS}
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
