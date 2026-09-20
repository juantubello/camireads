'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Tag as TagIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TagChip } from '@/components/tag-chip'
import { cn } from '@/lib/utils'
import {
  fetchTags,
  newSelection,
  normalizeForSearch,
  sameSelection,
  slugify,
  tagColor,
  toSelection,
  type Tag,
  type TagSelection,
} from '@/lib/tags'

const MAX_SUGGESTIONS = 6
const MAX_TAG_LENGTH = 40

/**
 * Selector de tags libre con autocompletado.
 *
 * La clave del pedido: si escribe "Tengo en físico" y ese tag ya existe, la UI
 * tiene que ofrecérselo ANTES de que intente crearlo. Por eso comparamos por
 * slug normalizado (mismo criterio que el backend en Java): si el slug ya
 * existe, la opción "Crear" ni aparece — solo el tag existente, marcado.
 *
 * No usa `components/ui/command.tsx` (cmdk) porque su `CommandInput` fija el
 * alto del wrapper en 36px y acá los targets tienen que ser de 44px en mobile.
 * Reusa `Input`, `Label` y `TagChip`.
 */
export function TagPicker({
  value,
  onChange,
  label = 'Tags',
  description = 'Agrupá el libro (favoritos, saga por terminar, lo tenés en físico…). Si el tag ya existe, elegilo de la lista para reusarlo.',
  disabled = false,
}: {
  value: TagSelection[]
  onChange: (next: TagSelection[]) => void
  label?: string
  description?: string
  disabled?: boolean
}) {
  const inputId = useId()
  const listId = `${inputId}-list`

  const [available, setAvailable] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetchTags(controller.signal)
      .then((tags) => {
        setAvailable(tags)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(
          error instanceof Error ? error.message : 'No pude traer los tags.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [])

  const trimmedQuery = query.trim().replace(/\s+/g, ' ')
  const querySlug = slugify(trimmedQuery)

  const suggestions = useMemo(() => {
    const needle = normalizeForSearch(trimmedQuery)
    const matches = available.filter((tag) =>
      needle ? normalizeForSearch(tag.name).includes(needle) : true,
    )

    // El que coincide exacto por slug va primero: es el que hay que reusar.
    matches.sort((a, b) => {
      const aExact = a.slug === querySlug ? 0 : 1
      const bExact = b.slug === querySlug ? 0 : 1
      if (aExact !== bExact) return aExact - bExact
      return (b.bookCount ?? 0) - (a.bookCount ?? 0)
    })

    return matches.slice(0, MAX_SUGGESTIONS)
  }, [available, trimmedQuery, querySlug])

  const slugExists =
    querySlug.length > 0 &&
    (available.some((tag) => tag.slug === querySlug) ||
      value.some((tag) => tag.slug === querySlug))

  const canCreate = trimmedQuery.length > 0 && !slugExists

  const options: Array<
    { kind: 'existing'; tag: Tag } | { kind: 'create'; name: string }
  > = [
    ...suggestions.map((tag) => ({ kind: 'existing' as const, tag })),
    ...(canCreate ? [{ kind: 'create' as const, name: trimmedQuery }] : []),
  ]

  useEffect(() => {
    setActiveIndex(0)
  }, [query, open])

  function isSelected(slug: string) {
    return value.some((tag) => tag.slug === slug)
  }

  function addSelection(selection: TagSelection) {
    if (value.some((tag) => sameSelection(tag, selection))) {
      setQuery('')
      return
    }
    onChange([...value, selection])
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }

  function pick(option: (typeof options)[number]) {
    if (option.kind === 'existing') {
      if (isSelected(option.tag.slug)) {
        setQuery('')
        return
      }
      addSelection(toSelection(option.tag))
    } else {
      addSelection(newSelection(option.name))
    }
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (options.length ? (i + 1) % options.length : 0))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) =>
        options.length ? (i - 1 + options.length) % options.length : 0,
      )
      return
    }
    if (event.key === 'Enter') {
      // Nunca enviar el formulario desde este input.
      event.preventDefault()
      const option = options[activeIndex]
      if (option) pick(option)
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'Backspace' && query.length === 0 && value.length > 0) {
      removeAt(value.length - 1)
    }
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label htmlFor={inputId} className="text-base font-semibold">
        {label}
      </Label>
      <p className="text-sm text-muted-foreground">{description}</p>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2 pt-1" aria-label="Tags elegidos">
          {value.map((tag, index) => (
            <li key={tag.id ?? `new-${tag.slug}`}>
              <TagChip
                tag={tag}
                size="md"
                pending={tag.id === null}
                onRemove={disabled ? undefined : () => removeAt(index)}
              />
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Input
          id={inputId}
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          maxLength={MAX_TAG_LENGTH}
          value={query}
          placeholder={loading ? 'Cargando tags…' : 'Escribí un tag y elegilo o creálo'}
          className="h-11 text-base"
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />

        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {open && !loading && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            <ul id={listId} role="listbox" className="max-h-72 overflow-y-auto py-1">
              {options.length === 0 && (
                <li className="px-3 py-3 text-sm text-muted-foreground">
                  {trimmedQuery
                    ? 'Ese tag ya está agregado.'
                    : 'Todavía no hay tags. Escribí uno para crearlo.'}
                </li>
              )}

              {options.map((option, index) => {
                const active = index === activeIndex
                if (option.kind === 'existing') {
                  const already = isSelected(option.tag.slug)
                  const exact = option.tag.slug === querySlug
                  return (
                    <li key={`tag-${option.tag.id}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        disabled={already}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => pick(option)}
                        className={cn(
                          'flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                          active && !already && 'bg-accent',
                          already && 'opacity-60',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: tagColor(option.tag) }}
                        />
                        <span className="flex-1 truncate font-medium">
                          {option.tag.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {already
                            ? 'ya agregado'
                            : exact
                              ? 'ya existe · se reusa'
                              : `${option.tag.bookCount ?? 0} ${
                                  option.tag.bookCount === 1 ? 'libro' : 'libros'
                                }`}
                        </span>
                      </button>
                    </li>
                  )
                }

                return (
                  <li key="create-option">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => pick(option)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                        active && 'bg-accent',
                      )}
                    >
                      <Plus className="h-4 w-4 shrink-0 text-primary" />
                      <span className="flex-1 truncate">
                        Crear el tag{' '}
                        <span className="font-semibold">“{option.name}”</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>

      {loadError && (
        <p className="flex items-center gap-2 text-sm text-destructive">
          <TagIcon className="h-4 w-4 shrink-0" />
          {loadError}
        </p>
      )}
    </div>
  )
}
