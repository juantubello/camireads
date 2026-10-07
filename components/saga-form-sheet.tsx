'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Camera, Check, ImageOff, Link2, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { SagaCover } from '@/components/saga-cover'
import { formatBytes, type ResizeResult } from '@/lib/image-resize'
import {
  createSaga,
  normalizeSagaName,
  resizeSagaCover,
  sagaCoverSrc,
  updateSaga,
  type SagaDetail,
  type SagaSummary,
} from '@/lib/sagas'
import { cn } from '@/lib/utils'

type ImageMode = 'upload' | 'link'

const NAME_MAX = 80

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Hoja para crear o editar una saga: nombre + imagen.
 *
 * La imagen sigue el mismo patrón que la tapa de los libros (decisión de
 * Juan): **subir una foto o pegar un link**. La foto se achica SIEMPRE acá
 * (lado mayor 600px) antes de salir, porque viaja en base64 dentro de la base.
 *
 * Se usa una hoja inferior (vaul) y no un formulario inline como en los tags:
 * acá hay preview de imagen y dos modos, y en una fila de la grilla no entra.
 */
export function SagaFormSheet({
  open,
  onOpenChange,
  saga,
  existingNames = [],
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si viene, la hoja edita esa saga; si no, crea una nueva. */
  saga?: SagaSummary | null
  /** Nombres de las otras sagas, para avisar del repetido sin ir al server. */
  existingNames?: string[]
  onSaved: (saga: SagaDetail) => void
}) {
  const editing = Boolean(saga)
  const nameId = useId()
  const urlId = useId()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [mode, setMode] = useState<ImageMode>('upload')
  const [upload, setUpload] = useState<ResizeResult | null>(null)
  const [url, setUrl] = useState('')
  const [urlBroken, setUrlBroken] = useState(false)
  const [removeCover, setRemoveCover] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cada vez que se abre arranca desde lo guardado (y no desde lo que quedó de
  // la vez anterior que se cerró sin guardar). Mismo patrón que `RatingSheet`.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName(saga?.name ?? '')
      // Si la saga ya tiene un link, abre en "Pegar link" con el link a la vista.
      setMode(saga?.urlCover && !saga?.coverDataUrl ? 'link' : 'upload')
      setUrl(saga?.urlCover && !saga?.coverDataUrl ? saga.urlCover : '')
      setUpload(null)
      setUrlBroken(false)
      setRemoveCover(false)
      setError(null)
    }
  }

  useEffect(() => {
    setUrlBroken(false)
  }, [url])

  const trimmedName = name.trim().replace(/\s+/g, ' ')
  const ownName = saga ? normalizeSagaName(saga.name) : null
  const clash =
    trimmedName.length > 0 &&
    normalizeSagaName(trimmedName) !== ownName &&
    existingNames.some((n) => normalizeSagaName(n) === normalizeSagaName(trimmedName))

  const trimmedUrl = url.trim()
  const urlInvalid = trimmedUrl.length > 0 && !isHttpUrl(trimmedUrl)

  // Lo que se va a ver después de guardar, para la preview. Si en el modo
  // elegido todavía no hay nada nuevo, se muestra la imagen que ya tiene.
  const currentOwn = saga && !removeCover ? sagaCoverSrc(saga) : null
  const linkPreview = mode === 'link' && trimmedUrl && !urlInvalid ? trimmedUrl : null
  const previewSrc =
    mode === 'upload'
      ? (upload?.dataUrl ?? currentOwn)
      : (linkPreview ?? (trimmedUrl ? null : currentOwn))

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setResizing(true)
    try {
      const result = await resizeSagaCover(file)
      setUpload(result)
      setRemoveCover(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude procesar esa imagen.')
    } finally {
      setResizing(false)
      // Permite volver a elegir el MISMO archivo (si no, `change` no dispara).
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function buildPayload() {
    const payload: {
      name?: string
      urlCover?: string
      coverDataUrl?: string
      clearCover?: boolean
    } = {}

    if (!editing || trimmedName !== saga?.name) payload.name = trimmedName

    if (mode === 'upload' && upload) {
      payload.coverDataUrl = upload.dataUrl
    } else if (mode === 'link' && trimmedUrl && trimmedUrl !== (saga?.urlCover ?? '')) {
      payload.urlCover = trimmedUrl
    } else if (editing && removeCover && sagaCoverSrc(saga!)) {
      payload.clearCover = true
    }
    return payload
  }

  async function submit() {
    if (saving || resizing) return
    if (!trimmedName) {
      setError('Ponele un nombre a la saga.')
      return
    }
    if (clash) return
    if (mode === 'link' && urlInvalid) {
      setError('Ese link no parece una dirección web. Tiene que empezar con https://')
      return
    }

    const payload = buildPayload()
    if (editing && Object.keys(payload).length === 0) {
      onOpenChange(false)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const saved = editing
        ? await updateSaga(saga!.id, payload)
        : await createSaga({
            name: trimmedName,
            ...(payload.coverDataUrl ? { coverDataUrl: payload.coverDataUrl } : {}),
            ...(payload.urlCover ? { urlCover: payload.urlCover } : {}),
          })
      onSaved(saved)
      onOpenChange(false)
    } catch (err) {
      // Acá cae el 409 del nombre repetido: el mensaje del backend tal cual.
      setError(err instanceof Error ? err.message : 'No pude guardar la saga.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DrawerContent>
        {/* El contenido scrollea dentro de la hoja: con el teclado abierto en
            el iPhone, la hoja entera no entra en pantalla. */}
        <div className="mx-auto flex w-full max-w-md min-h-0 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader>
            <DrawerTitle className="text-xl">
              {editing ? 'Editar saga' : 'Nueva saga'}
            </DrawerTitle>
            <DrawerDescription>
              Un nombre y, si querés, una imagen. Sin imagen se arma sola con las
              tapas de los primeros libros.
            </DrawerDescription>
          </DrawerHeader>

          <form
            className="space-y-5 px-4"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <div className="space-y-2">
              <label htmlFor={nameId} className="block text-sm font-medium">
                Nombre
              </label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                placeholder="Ej: Trono de cristal"
                maxLength={NAME_MAX}
                autoComplete="off"
                enterKeyHint="done"
                className="min-h-11 text-base"
                aria-invalid={clash || undefined}
                aria-describedby={clash ? `${nameId}-clash` : undefined}
              />
              {clash && (
                <p id={`${nameId}-clash`} className="text-sm text-destructive">
                  Ya tenés una saga con ese nombre. Poné otro.
                </p>
              )}
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Imagen (opcional)</legend>

              {/* Dos modos, como la tapa de los libros. Radiogroup nativo:
                  navegable con flechas y anunciable sin JS propio. */}
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/50 p-1">
                {(
                  [
                    { id: 'upload', label: 'Subir foto', icon: Camera },
                    { id: 'link', label: 'Pegar link', icon: Link2 },
                  ] as const
                ).map((option) => (
                  <label key={option.id} className="relative">
                    <input
                      type="radio"
                      name={`${nameId}-image-mode`}
                      value={option.id}
                      checked={mode === option.id}
                      onChange={() => {
                        setMode(option.id)
                        setError(null)
                      }}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                        'peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                        mode === option.id
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <option.icon aria-hidden="true" className="h-4 w-4" />
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>

              <div className="flex gap-4">
                {/* Preview en proporción de tapa, igual que en la grilla. */}
                <div className="w-24 shrink-0">
                  {previewSrc ? (
                    <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-secondary">
                      <img
                        src={previewSrc}
                        alt="Vista previa de la imagen de la saga"
                        className="h-full w-full object-cover"
                        onError={() => {
                          if (previewSrc === linkPreview) setUrlBroken(true)
                        }}
                      />
                    </div>
                  ) : (
                    <SagaCover
                      saga={{
                        coverDataUrl: null,
                        urlCover: null,
                        previewCovers: saga?.previewCovers ?? [],
                      }}
                      iconClassName="h-8 w-8"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  {mode === 'upload' ? (
                    <>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                        onChange={(e) => void handleFile(e.target.files?.[0])}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full"
                        onClick={() => fileRef.current?.click()}
                        disabled={resizing || saving}
                      >
                        {resizing ? (
                          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                        ) : (
                          <Camera aria-hidden="true" className="h-4 w-4" />
                        )}
                        {resizing
                          ? 'Achicando…'
                          : upload || currentOwn
                            ? 'Elegir otra foto'
                            : 'Elegir foto'}
                      </Button>
                      {upload && (
                        <p className="text-xs text-muted-foreground" role="status">
                          Lista: {upload.width}×{upload.height} px, {formatBytes(upload.resizedBytes)}
                          {upload.originalBytes > upload.resizedBytes
                            ? ` (era ${formatBytes(upload.originalBytes)})`
                            : ''}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <label htmlFor={urlId} className="sr-only">
                        Link de la imagen
                      </label>
                      <Input
                        id={urlId}
                        type="url"
                        inputMode="url"
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value)
                          setRemoveCover(false)
                          setError(null)
                        }}
                        placeholder="https://…"
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="min-h-11 text-base"
                        aria-invalid={urlInvalid || undefined}
                      />
                      {urlInvalid ? (
                        <p className="text-xs text-destructive">
                          Tiene que empezar con https://
                        </p>
                      ) : urlBroken ? (
                        <p className="text-xs text-muted-foreground" role="status">
                          No pude ver esa imagen. Se puede guardar igual, pero fijate el link.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Copiá la dirección de una imagen (por ejemplo, de Goodreads).
                        </p>
                      )}
                    </>
                  )}

                  {/* Solo cuando lo que se ve es la imagen GUARDADA: si ya eligió una
                      foto o pegó un link nuevo, "Quitar" confundiría. */}
                  {editing &&
                    sagaCoverSrc(saga!) &&
                    !removeCover &&
                    !upload &&
                    !(mode === 'link' && trimmedUrl !== (saga!.urlCover ?? '')) && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11 w-full text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        setRemoveCover(true)
                        setUrl('')
                      }}
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                      Quitar imagen
                    </Button>
                  )}
                  {editing && removeCover && (
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground" role="status">
                      <ImageOff aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Al guardar se quita la imagen y se usan las tapas de los libros.
                    </p>
                  )}
                  {!previewSrc && !editing && (
                    <p className="text-xs text-muted-foreground">
                      Sin imagen: se usan las tapas de los primeros libros.
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            {/* Submit oculto: Enter en el nombre guarda. Los botones de verdad
                van en el footer de la hoja. */}
            <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
          </form>

          <DrawerFooter className="gap-1">
            <Button
              type="button"
              className="h-12 w-full text-base"
              onClick={() => void submit()}
              aria-disabled={saving || resizing || clash || !trimmedName}
            >
              {saving ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Check aria-hidden="true" className="h-4 w-4" />
              )}
              {editing ? 'Guardar' : 'Crear saga'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
