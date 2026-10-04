'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Check, Loader2, Pencil, Trash2, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  PHOTO_SIZE,
  fetchProfile,
  formatBytes,
  resizeProfilePhoto,
  saveProfile,
  type Profile,
  type ResizeResult,
} from '@/lib/profile'

/**
 * Cabecera del perfil: foto y nombre.
 *
 * ⚠️ La foto SIEMPRE se redimensiona acá, en el navegador, a 400x400 antes de
 * salir. No es una optimización: la foto se guarda en base64 dentro de la base,
 * o sea que entra en cada `pg_dump`. Cruda son ~5,5 MB de base64 contra 1,2 MB
 * que pesa hoy el backup entero de 13 años de reseñas. El backend además
 * rechaza con 400 lo que se pase, pero para cuando eso pasa ya subiste 4 MB.
 */
export function ProfileHeader({
  onProfileLoaded,
}: {
  onProfileLoaded?: (profile: Profile) => void
}) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState<string | null>(null)

  const [working, setWorking] = useState<null | 'resizing' | 'saving' | 'removing'>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastResize, setLastResize] = useState<ResizeResult | null>(null)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await fetchProfile(signal)
        if (signal?.aborted) return
        setProfile(data)
        setUnavailable(null)
        onProfileLoaded?.(data)
      } catch (err) {
        if (signal?.aborted) return
        setUnavailable(err instanceof Error ? err.message : 'No pude traer el perfil.')
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [onProfileLoaded],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    if (editingName) nameRef.current?.focus()
  }, [editingName])

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setLastResize(null)
    setWorking('resizing')

    try {
      const result = await resizeProfilePhoto(file)
      setLastResize(result)
      setWorking('saving')
      const saved = await saveProfile({ photoDataUrl: result.dataUrl })
      setProfile(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude guardar la foto.')
    } finally {
      setWorking(null)
      // Permite volver a elegir el MISMO archivo (si no, `change` no dispara).
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removePhoto() {
    setError(null)
    setWorking('removing')
    try {
      // `null` explícito = borrar. Omitir la clave la dejaría como está.
      const saved = await saveProfile({ photoDataUrl: null })
      setProfile(saved)
      setLastResize(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude borrar la foto.')
    } finally {
      setWorking(null)
    }
  }

  async function saveName() {
    const clean = nameDraft.trim().replace(/\s+/g, ' ')
    setWorking('saving')
    setError(null)
    try {
      const saved = await saveProfile({ displayName: clean || null })
      setProfile(saved)
      setEditingName(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pude guardar el nombre.')
    } finally {
      setWorking(null)
    }
  }

  const busy = working !== null
  const displayName = profile?.displayName?.trim() || 'Camila'
  const photo = profile?.photoDataUrl ?? null

  return (
    <section aria-labelledby="profile-heading" className="flex flex-col items-center text-center">
      <h1 id="profile-heading" className="sr-only">
        Mi perfil
      </h1>

      {/* ---------- la foto ---------- */}
      <div className="relative">
        <div className="h-28 w-28 overflow-hidden rounded-full border-2 border-border bg-muted md:h-32 md:w-32">
          {loading ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- es un data URL:
            // no hay nada que optimizar y `next/image` no procesa data URLs.
            <img
              src={photo}
              alt={`Foto de ${displayName}`}
              width={PHOTO_SIZE}
              height={PHOTO_SIZE}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <User aria-hidden="true" className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Botón de cámara pegado a la foto. 44px reales aunque el círculo se
            vea más chico por el borde. */}
        {!unavailable && (
          <Button
            type="button"
            variant="default"
            className="absolute -bottom-1 -right-1 h-11 w-11 rounded-full p-0 shadow-sm"
            aria-label={photo ? 'Cambiar la foto de perfil' : 'Elegir una foto de perfil'}
            onClick={() => fileRef.current?.click()}
            aria-disabled={busy}
          >
            {working === 'resizing' || working === 'saving' ? (
              <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
            ) : (
              <Camera aria-hidden="true" className="h-5 w-5" />
            )}
          </Button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>

      {/* ---------- el nombre ---------- */}
      {editingName ? (
        <div className="mt-4 flex w-full max-w-xs items-center gap-2">
          <Input
            ref={nameRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void saveName()
              }
              if (e.key === 'Escape') setEditingName(false)
            }}
            maxLength={60}
            aria-label="Tu nombre"
            className="min-h-11 text-base"
          />
          <Button
            type="button"
            className="h-11 w-11 shrink-0 p-0"
            aria-label="Guardar el nombre"
            onClick={() => void saveName()}
            aria-disabled={busy}
          >
            <Check aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-11 shrink-0 p-0"
            aria-label="Cancelar"
            onClick={() => setEditingName(false)}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-1">
          <p className="font-serif text-2xl font-bold text-foreground">{displayName}</p>
          {!unavailable && (
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 p-0 text-muted-foreground"
              aria-label="Editar tu nombre"
              onClick={() => {
                setNameDraft(profile?.displayName ?? '')
                setEditingName(true)
              }}
            >
              <Pencil aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* ---------- estado del redimensionado ---------- */}
      {working === 'resizing' && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          Achicando la foto a {PHOTO_SIZE}×{PHOTO_SIZE}…
        </p>
      )}

      {lastResize && working === null && (
        <p role="status" className="mt-2 max-w-xs text-xs leading-snug text-muted-foreground">
          Guardada a {PHOTO_SIZE}×{PHOTO_SIZE}: pasó de{' '}
          <strong className="font-semibold text-foreground">
            {formatBytes(lastResize.originalBytes)}
          </strong>{' '}
          a{' '}
          <strong className="font-semibold text-foreground">
            {formatBytes(lastResize.resizedBytes)}
          </strong>
          . Así la copia de seguridad de tus reseñas sigue siendo liviana.
        </p>
      )}

      {photo && !editingName && !unavailable && (
        <Button
          type="button"
          variant="ghost"
          className="mt-1 min-h-11 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => void removePhoto()}
          aria-disabled={busy}
        >
          {working === 'removing' ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          Sacar la foto
        </Button>
      )}

      {error && (
        <p role="alert" className="mt-2 max-w-xs text-sm text-destructive">
          {error}
        </p>
      )}

      {unavailable && !loading && (
        <p className="mt-2 max-w-xs text-xs leading-snug text-muted-foreground">
          La foto y el nombre todavía no están disponibles: {unavailable}
        </p>
      )}
    </section>
  )
}
