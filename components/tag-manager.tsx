'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { fetchTags, tagColor, slugify, type Tag } from '@/lib/tags'
import {
  TAG_COLOR_CHOICES,
  createTag,
  deleteTag,
  updateTag,
} from '@/lib/tag-admin'

type RowMode = 'idle' | 'editing' | 'confirming-delete'

/**
 * ABM de tags.
 *
 * Decisiones:
 * - **Todo inline, sin modales.** Un overlay fijo en iOS pelea con la tab bar
 *   (`position: fixed` + `env(safe-area-inset-bottom)`) y con el scroll del
 *   `<main>`. Editar y confirmar el borrado se abren dentro de la misma fila,
 *   que además deja a la vista el nombre y el conteo del tag que se está tocando.
 * - **El borrado dice cuántos libros pierden el tag**, con el número que vino
 *   del backend (`bookCount`). "Tengo en físico" son 81 asociaciones que Camila
 *   cargó a mano: borrar sin ese número es perder trabajo sin aviso.
 * - Los errores del backend (el 409 del slug repetido) se muestran **tal cual**,
 *   porque el mensaje dice con qué tag choca.
 */
export function TagManager() {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoadError(null)
      const data = await fetchTags(signal)
      if (signal?.aborted) return
      setTags(data)
    } catch (error) {
      if (signal?.aborted) return
      setLoadError(error instanceof Error ? error.message : 'No pude traer los tags.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const totalAssociations = tags.reduce((sum, t) => sum + (t.bookCount ?? 0), 0)

  return (
    <section aria-labelledby="tags-heading" className="space-y-4">
      {/* El título va oculto a la vista: la solapa activa justo arriba ya dice
          "Mis tags" y repetirlo es ruido. Para un lector de pantalla, en
          cambio, el encabezado es la referencia de la sección. */}
      <h2 id="tags-heading" className="sr-only">
        Mis tags
      </h2>
      {!loading && tags.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {tags.length} {tags.length === 1 ? 'tag' : 'tags'} · {totalAssociations}{' '}
          {totalAssociations === 1 ? 'libro etiquetado' : 'libros etiquetados'}
        </p>
      )}

      <NewTagForm
        existingTags={tags}
        onCreated={(tag) =>
          setTags((prev) =>
            [...prev.filter((t) => t.id !== tag.id), tag].sort((a, b) =>
              a.name.localeCompare(b.name, 'es'),
            ),
          )
        }
      />

      {loading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Cargando tus tags…
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground"
        >
          <p>{loadError}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => {
              setLoading(true)
              void load()
            }}
          >
            Reintentar
          </Button>
        </div>
      )}

      {!loading && !loadError && tags.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Todavía no tenés ningún tag. Creá el primero acá arriba, o agregá uno
          desde la ficha de cualquier libro.
        </p>
      )}

      {tags.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {tags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              otherTags={tags.filter((t) => t.id !== tag.id)}
              onUpdated={(updated) =>
                setTags((prev) =>
                  prev
                    .map((t) => (t.id === updated.id ? { ...t, ...updated } : t))
                    .sort((a, b) => a.name.localeCompare(b.name, 'es')),
                )
              }
              onDeleted={() =>
                setTags((prev) => prev.filter((t) => t.id !== tag.id))
              }
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Crear                                                               */
/* ------------------------------------------------------------------ */

function NewTagForm({
  existingTags,
  onCreated,
}: {
  existingTags: Tag[]
  onCreated: (tag: Tag) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(TAG_COLOR_CHOICES[0].hex)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // El "Listo, creé «X»" se va solo: si no, queda contradiciendo la lista
  // cuando la usuaria borra justo el tag que acaba de crear.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const trimmed = name.trim().replace(/\s+/g, ' ')
  // Mismo criterio de slug que Java: si ya existe, el backend devolvería 200
  // con el tag viejo en vez de crear uno nuevo. Avisamos antes de mandar nada.
  const clash = trimmed
    ? existingTags.find((t) => t.slug === slugify(trimmed))
    : undefined

  async function submit() {
    if (!trimmed || saving || clash) return
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const { tag, created } = await createTag(trimmed, color)
      onCreated(tag)
      setName('')
      setOpen(false)
      setNotice(
        created
          ? `Listo, creé «${tag.name}».`
          : `«${tag.name}» ya existía, así que lo reusé.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude crear el tag.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full justify-center gap-2"
          onClick={() => {
            setOpen(true)
            setNotice(null)
          }}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Crear un tag nuevo
        </Button>
        {notice && (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="space-y-2">
        <label htmlFor="new-tag-name" className="block text-sm font-medium">
          Nombre del tag
        </label>
        <Input
          id="new-tag-name"
          ref={inputRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder="Ej: Para releer"
          maxLength={60}
          autoComplete="off"
          className="min-h-11 text-base"
          aria-describedby={clash ? 'new-tag-clash' : undefined}
        />
        {clash && (
          <p id="new-tag-clash" className="text-sm text-foreground">
            Ya tenés un tag que se llama «{clash.name}» ({clash.bookCount ?? 0}{' '}
            {clash.bookCount === 1 ? 'libro' : 'libros'}). Poné otro nombre.
          </p>
        )}
      </div>

      <ColorPicker value={color} onChange={setColor} idPrefix="new-tag" />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          className="min-h-11 flex-1"
          onClick={() => void submit()}
          aria-disabled={!trimmed || saving || Boolean(clash)}
        >
          {saving ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Check aria-hidden="true" className="h-4 w-4" />
          )}
          Crear
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          onClick={() => {
            setOpen(false)
            setName('')
            setError(null)
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Una fila                                                            */
/* ------------------------------------------------------------------ */

function TagRow({
  tag,
  otherTags,
  onUpdated,
  onDeleted,
}: {
  tag: Tag
  otherTags: Tag[]
  onUpdated: (tag: Tag) => void
  onDeleted: () => void
}) {
  const [mode, setMode] = useState<RowMode>('idle')
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState<string>(tagColor(tag))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode === 'editing') editInputRef.current?.focus()
    if (mode === 'confirming-delete') confirmRef.current?.focus()
  }, [mode])

  const bookCount = tag.bookCount ?? 0
  const trimmed = name.trim().replace(/\s+/g, ' ')
  const changed = trimmed !== tag.name || color !== tagColor(tag)
  const localClash = trimmed
    ? otherTags.find((t) => t.slug === slugify(trimmed))
    : undefined

  async function save() {
    if (!trimmed || busy || !changed) return
    setBusy(true)
    setError(null)
    try {
      const updated = await updateTag(tag.id, { name: trimmed, color })
      // El PUT no devuelve bookCount: lo conservamos del listado.
      onUpdated({ ...updated, bookCount: updated.bookCount ?? bookCount })
      setMode('idle')
    } catch (err) {
      // Acá cae el 409: se muestra el `message` del backend tal cual.
      setError(err instanceof Error ? err.message : 'No pude guardar el tag.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await deleteTag(tag.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude borrar el tag.')
      setBusy(false)
    }
  }

  return (
    <li className="p-3">
      {/* -------- fila de lectura -------- */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ backgroundColor: tagColor(tag) }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{tag.name}</p>
          <p className="text-xs text-muted-foreground">
            {bookCount === 0
              ? 'Sin libros'
              : `${bookCount} ${bookCount === 1 ? 'libro' : 'libros'}`}
          </p>
        </div>

        {mode === 'idle' && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 p-0"
              aria-label={`Editar el tag ${tag.name}`}
              onClick={() => {
                setName(tag.name)
                setColor(tagColor(tag))
                setError(null)
                setMode('editing')
              }}
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 p-0 text-muted-foreground hover:text-destructive"
              aria-label={`Borrar el tag ${tag.name}`}
              onClick={() => {
                setError(null)
                setMode('confirming-delete')
              }}
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        )}

        {mode !== 'idle' && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 shrink-0 p-0"
            aria-label="Cerrar"
            onClick={() => {
              setMode('idle')
              setError(null)
            }}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* -------- editar -------- */}
      {mode === 'editing' && (
        <div className="mt-3 space-y-4 rounded-lg bg-muted/40 p-3">
          <div className="space-y-2">
            <label
              htmlFor={`tag-name-${tag.id}`}
              className="block text-sm font-medium"
            >
              Nombre
            </label>
            <Input
              id={`tag-name-${tag.id}`}
              ref={editInputRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void save()
                }
                if (e.key === 'Escape') setMode('idle')
              }}
              maxLength={60}
              autoComplete="off"
              className="min-h-11 text-base"
            />
            {localClash && (
              <p className="text-sm text-foreground">
                Ojo: «{localClash.name}» ya usa ese nombre. Si guardás, el
                servidor lo va a rechazar.
              </p>
            )}
          </div>

          <ColorPicker
            value={color}
            onChange={setColor}
            idPrefix={`tag-${tag.id}`}
          />

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              className="min-h-11 flex-1"
              onClick={() => void save()}
              aria-disabled={!trimmed || busy || !changed}
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Check aria-hidden="true" className="h-4 w-4" />
              )}
              Guardar
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-11"
              onClick={() => setMode('idle')}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* -------- confirmar borrado -------- */}
      {mode === 'confirming-delete' && (
        <div
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-label={`Confirmar el borrado del tag ${tag.name}`}
          className="mt-3 space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 outline-none"
        >
          <p className="text-sm text-foreground">
            {bookCount === 0 ? (
              <>
                Vas a borrar «{tag.name}». No lo usa ningún libro, así que no se
                pierde nada más.
              </>
            ) : (
              <>
                Vas a borrar «{tag.name}».{' '}
                <strong className="font-semibold">
                  {bookCount} {bookCount === 1 ? 'libro pierde' : 'libros pierden'}{' '}
                  este tag.
                </strong>{' '}
                Los libros y sus reseñas quedan intactos: lo que se borra es la
                etiqueta, y eso no se puede deshacer.
              </>
            )}
          </p>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 flex-1"
              onClick={() => void remove()}
              aria-disabled={busy}
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              )}
              {bookCount === 0
                ? 'Sí, borrar'
                : `Sí, borrar y sacárselo a ${bookCount}`}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setMode('idle')}
            >
              No
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Color                                                               */
/* ------------------------------------------------------------------ */

function ColorPicker({
  value,
  onChange,
  idPrefix,
}: {
  value: string
  onChange: (hex: string) => void
  idPrefix: string
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Color</legend>
      {/* Radiogroup nativo: navegable con flechas y anunciable, sin JS propio.
          Cada target es de 44px aunque el círculo pintado sea más chico. */}
      <div className="flex flex-wrap gap-1">
        {TAG_COLOR_CHOICES.map((choice) => {
          const id = `${idPrefix}-color-${choice.hex.slice(1)}`
          const selected = value.toLowerCase() === choice.hex.toLowerCase()
          return (
            <span key={choice.hex} className="relative">
              <input
                type="radio"
                id={id}
                name={`${idPrefix}-color`}
                value={choice.hex}
                checked={selected}
                onChange={() => onChange(choice.hex)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                title={choice.name}
                className={cn(
                  'flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full transition-all',
                    selected && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
                  )}
                  style={{ backgroundColor: choice.hex }}
                >
                  {selected && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
                <span className="sr-only">{choice.name}</span>
              </label>
            </span>
          )
        })}
      </div>
    </fieldset>
  )
}
