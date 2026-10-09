'use client'

import { useState } from 'react'
import { Library } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bookCoverSrc, sagaCoverSrc, type SagaSummary } from '@/lib/sagas'

/**
 * Imagen de una saga, siempre en proporción de tapa (2:3).
 *
 * Orden de preferencia:
 *   1. La imagen propia (foto subida o link).
 *   2. Un collage con las tapas de los primeros libros, en el orden de la saga
 *      (es lo que se ve en un estante: la saga "es" sus primeros tomos).
 *   3. Un placeholder con ícono.
 *
 * Es decorativa para el lector de pantalla cuando `alt` viene vacío: en la
 * grilla el nombre de la saga ya está escrito debajo y repetirlo es ruido.
 *
 * Con el armado automático la grilla puede tener ~300 sagas y hasta 4 tapas
 * cada una (más de 1000 imágenes): `loading="lazy"` hace que solo se bajen las
 * que están cerca de la pantalla, y `decoding="async"` saca la decodificación
 * del hilo principal para que el scroll no tironee en el iPhone.
 */
export function SagaCover({
  saga,
  alt = '',
  className,
  iconClassName,
}: {
  saga: Pick<SagaSummary, 'coverDataUrl' | 'urlCover' | 'previewCovers'>
  alt?: string
  className?: string
  iconClassName?: string
}) {
  const own = sagaCoverSrc(saga)
  // Si el link de la imagen se rompió (pasa: los links de tapas caducan), se
  // cae al collage en vez de dejar el ícono de imagen rota.
  const [ownFailed, setOwnFailed] = useState(false)
  const covers = saga.previewCovers
    .map((c) => bookCoverSrc(c))
    .filter((c): c is string => Boolean(c))
    .slice(0, 4)

  return (
    <div
      className={cn(
        'relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-secondary',
        className,
      )}
    >
      {own && !ownFailed ? (
        <img
          src={own}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setOwnFailed(true)}
        />
      ) : covers.length > 0 ? (
        <Collage covers={covers} alt={alt} />
      ) : (
        <div
          role={alt ? 'img' : undefined}
          aria-label={alt || undefined}
          className="flex h-full w-full items-center justify-center"
        >
          <Library
            aria-hidden="true"
            className={cn('h-10 w-10 text-muted-foreground', iconClassName)}
          />
        </div>
      )}
    </div>
  )
}

function Collage({ covers, alt }: { covers: string[]; alt: string }) {
  // 1 tapa: entera. 2: mitades lado a lado. 3 o 4: grilla de 2x2 (con 3, el
  // cuarto casillero queda en el beige de fondo, que se lee como "hueco").
  const layout =
    covers.length === 1
      ? 'grid-cols-1 grid-rows-1'
      : covers.length === 2
        ? 'grid-cols-2 grid-rows-1'
        : 'grid-cols-2 grid-rows-2'

  return (
    <div
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      className={cn('grid h-full w-full gap-px bg-border', layout)}
    >
      {covers.map((src, index) => (
        <img
          key={`${index}-${src.slice(0, 40)}`}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full bg-secondary object-cover"
        />
      ))}
    </div>
  )
}
