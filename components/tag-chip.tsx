'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tagColor } from '@/lib/tags'

/**
 * Chip de tag.
 *
 * El color del tag va en el puntito y en el borde/fondo con alfa bajo, y el
 * texto usa `--foreground`. Así se lee el color del tag sin romper el contraste:
 * los hex de la base (#C77D6A y compañía) contra texto blanco quedan en ~3:1,
 * abajo del 4.5:1 que pide WCAG AA. Con fondo tenue + texto de la paleta el
 * contraste lo pone el tema (claro y oscuro), no el color del tag.
 *
 * `color` puede venir null (los tags creados por `newTagNames` no traen color):
 * `tagColor()` cae a un color estable de la paleta.
 *
 * Tamaños:
 *   md → target de 44px, para formularios (se puede quitar con la X).
 *   sm → chip de lectura, para resúmenes y filtros elegidos.
 *   xs → chip *decorativo* para las tarjetas de la lista, donde el alto de la
 *        tarjeta importa. No es clickeable a propósito: en la lista la tarjeta
 *        entera ya es un link y un target de ~20px encima de otro link es
 *        justo lo que hace errar el dedo en el iPhone.
 */
export function TagChip({
  tag,
  size = 'sm',
  onRemove,
  className,
  pending = false,
}: {
  tag: { name: string; slug?: string | null; color?: string | null }
  size?: 'xs' | 'sm' | 'md'
  onRemove?: () => void
  className?: string
  /** true = todavía no existe en la base (se va a crear al guardar) */
  pending?: boolean
}) {
  const color = tagColor(tag)

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium text-foreground',
        size === 'md'
          ? 'gap-2 min-h-11 pl-3 pr-1 text-sm'
          : size === 'sm'
            ? 'gap-2 px-2.5 py-1 text-xs'
            : 'gap-1.5 px-2 py-0.5 text-[11px] leading-[1.35]',
        !onRemove && size === 'md' && 'pr-3',
        className,
      )}
      style={{
        backgroundColor: `${color}1f`,
        borderColor: `${color}66`,
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          'rounded-full shrink-0',
          size === 'md' ? 'h-2.5 w-2.5' : size === 'sm' ? 'h-2 w-2' : 'h-1.5 w-1.5',
        )}
        style={{ backgroundColor: color }}
      />
      <span className={cn('truncate', size === 'xs' ? 'max-w-[8rem]' : 'max-w-[14rem]')}>
        {tag.name}
      </span>

      {pending && (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          nuevo
        </span>
      )}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar el tag ${tag.name}`}
          className={cn(
            'inline-flex items-center justify-center rounded-full text-muted-foreground',
            'transition-colors hover:text-foreground hover:bg-background/60',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            size === 'md' ? 'h-11 w-11 -my-2' : 'h-5 w-5',
          )}
        >
          <X className={size === 'md' ? 'h-4 w-4' : 'h-3 w-3'} />
        </button>
      )}
    </span>
  )
}
