'use client'

import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  RATING_MAX,
  RATING_MIN,
  RATING_STEP,
  ceilToQuarter,
  formatRating,
  isRated,
  ratingLabel,
  snapToQuarter,
} from '@/lib/rating'

type StarSize = 'sm' | 'md' | 'lg' | 'xl'

interface StarRatingProps {
  rating: number
  onRatingChange?: (rating: number) => void
  readonly?: boolean
  size?: StarSize
  /** Muestra el número ("3.75") al lado de las estrellas. Solo en lectura. */
  showValue?: boolean
  className?: string
  /** Nombre accesible del slider (si no hay un label visible que lo nombre). */
  'aria-label'?: string
  /** id del label visible que nombra al slider (ej. "Calificación *"). */
  'aria-labelledby'?: string
}

const SIZE_CLASSES: Record<StarSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-11 w-11',
}

const GAP_CLASSES: Record<StarSize, string> = {
  sm: 'gap-0.5',
  md: 'gap-1',
  lg: 'gap-1',
  xl: 'gap-2',
}

const VALUE_TEXT_CLASSES: Record<StarSize, string> = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
}

// La estrella de lucide no ocupa toda su caja de 24×24: el dibujo va más o
// menos de x=2 a x=22. Si recortáramos el relleno sobre la caja entera, un
// "0.25" se vería casi vacío (el primer 25% de la caja es casi todo margen).
// Por eso el recorte y el gesto se calculan sobre la parte VISIBLE del dibujo.
const ICON_BOX = 24
const ICON_INSET = 2
const ICON_VISIBLE = ICON_BOX - ICON_INSET * 2

/** Ancho (en % de la caja) que hay que destapar para mostrar `fraction` de la estrella. */
function clipWidthPercent(fraction: number): number {
  if (fraction <= 0) return 0
  if (fraction >= 1) return 100
  return ((ICON_INSET + ICON_VISIBLE * fraction) / ICON_BOX) * 100
}

/**
 * Calificación por estrellas, en cuartos (Fase 9).
 *
 * - Lectura (`readonly` o sin `onRatingChange`): 5 estrellas con relleno
 *   parcial exacto. Es una imagen para el lector de pantalla ("3.75 de 5
 *   estrellas"), no 5 botones deshabilitados que no sirven para nada.
 * - Edición: UN control `role="slider"`. Se toca o se desliza sobre la fila
 *   (el valor es el cuarto hacia arriba de donde está el dedo) y con teclado
 *   se mueve de a 0.25.
 */
export function StarRating({
  rating,
  onRatingChange,
  readonly = false,
  size = 'md',
  showValue = false,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: StarRatingProps) {
  const value = snapToQuarter(rating)
  const editable = !readonly && Boolean(onRatingChange)

  const starRefs = useRef<Array<HTMLSpanElement | null>>([])
  // Estado del gesto en curso. Va en un ref y no en state: cambia en cada
  // pointermove y no tiene que provocar renders propios.
  const gesture = useRef<{
    pointerId: number
    startX: number
    startY: number
    dragging: boolean
  } | null>(null)

  function emit(next: number) {
    const snapped = snapToQuarter(next)
    if (snapped !== value) onRatingChange?.(snapped)
  }

  /**
   * Convierte la X del dedo en calificación. Se suma cuánto de cada estrella
   * quedó "a la izquierda" del dedo, medido sobre la parte visible del dibujo;
   * así el hueco entre estrellas cuenta como estrella llena y no hay saltos.
   */
  function valueFromClientX(clientX: number): number {
    let total = 0
    for (const el of starRefs.current) {
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const left = rect.left + (rect.width * ICON_INSET) / ICON_BOX
      const width = (rect.width * ICON_VISIBLE) / ICON_BOX
      total += Math.min(1, Math.max(0, (clientX - left) / width))
    }
    return ceilToQuarter(total)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    // Captura: si el dedo se sale de la fila mientras desliza, seguimos
    // recibiendo los movimientos (y llegar "más allá" de la 5ª = 5.00).
    // try/catch: algunos navegadores tiran si el puntero ya no está activo.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // sin captura igual funciona mientras el dedo siga sobre la fila
    }
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      // Con mouse se califica al toque. Con el dedo esperamos: si en realidad
      // estaba scrolleando la página, iOS manda `pointercancel` y la
      // calificación no se toca por accidente.
      dragging: event.pointerType === 'mouse',
    }
    if (event.pointerType === 'mouse') emit(valueFromClientX(event.clientX))
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    if (!g.dragging) {
      // Recién cuando el movimiento es claramente horizontal lo tomamos como
      // "deslizar para calificar".
      const dx = Math.abs(event.clientX - g.startX)
      const dy = Math.abs(event.clientY - g.startY)
      if (dx < 4 || dx < dy) return
      g.dragging = true
    }
    emit(valueFromClientX(event.clientX))
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    // Un tap (sin arrastre) también califica: el valor es donde levantó el dedo.
    if (!g.dragging) emit(valueFromClientX(event.clientX))
    gesture.current = null
  }

  function handlePointerCancel() {
    // El navegador se quedó con el gesto (scroll vertical): no tocamos nada.
    gesture.current = null
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + RATING_STEP
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - RATING_STEP
        break
      case 'PageUp':
        next = value + 1
        break
      case 'PageDown':
        next = value - 1
        break
      case 'Home':
        next = RATING_MIN
        break
      case 'End':
        next = RATING_MAX
        break
      default:
        return
    }

    event.preventDefault()
    // Con teclado nunca se baja de 0.25: "sin calificar" se elige a propósito
    // (botón de borrar), no por apretar ← una vez de más.
    emit(Math.min(RATING_MAX, Math.max(RATING_MIN, next)))
  }

  const stars = [0, 1, 2, 3, 4].map((index) => {
    const fraction = Math.min(1, Math.max(0, value - index))
    return (
      <span
        key={index}
        ref={(el) => {
          starRefs.current[index] = el
        }}
        className="relative inline-flex shrink-0"
        aria-hidden="true"
      >
        <Star className={cn(SIZE_CLASSES[size], 'fill-none text-muted-foreground')} />
        {fraction > 0 && (
          // Segunda capa: la estrella llena, recortada al ancho del relleno.
          <span
            className="absolute inset-y-0 left-0 overflow-hidden"
            style={{ width: `${clipWidthPercent(fraction)}%` }}
          >
            <Star
              className={cn(SIZE_CLASSES[size], 'max-w-none fill-primary text-primary')}
            />
          </span>
        )}
      </span>
    )
  })

  if (!editable) {
    return (
      <div className={cn('inline-flex items-center gap-1.5', className)}>
        <div
          role="img"
          aria-label={ratingLabel(value)}
          className={cn('flex items-center', GAP_CLASSES[size])}
        >
          {stars}
        </div>
        {showValue && isRated(value) && (
          // aria-hidden: el número ya está en el aria-label de las estrellas.
          <span
            aria-hidden="true"
            className={cn(
              'font-medium tabular-nums text-muted-foreground',
              VALUE_TEXT_CLASSES[size],
            )}
          >
            {formatRating(value)}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={ariaLabelledBy ? undefined : (ariaLabel ?? 'Calificación')}
      aria-labelledby={ariaLabelledBy}
      aria-valuemin={RATING_MIN}
      aria-valuemax={RATING_MAX}
      // 0 = sin calificar queda fuera del rango del slider: en ese caso no se
      // informa valuenow y el texto lo dice con palabras.
      aria-valuenow={isRated(value) ? value : undefined}
      aria-valuetext={ratingLabel(value)}
      aria-orientation="horizontal"
      // vaul (la hoja inferior) arrastra la hoja con cualquier gesto: esto le
      // dice que acá el deslizamiento es para calificar, no para cerrarla.
      data-vaul-no-drag=""
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      className={cn(
        // min-h-11: target táctil de 44px aunque las estrellas sean chicas.
        // touch-pan-y: el scroll vertical sigue siendo de la página (iOS) y el
        // deslizamiento horizontal es nuestro.
        'inline-flex min-h-11 cursor-pointer touch-pan-y select-none items-center rounded-lg px-1',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        GAP_CLASSES[size],
        className,
      )}
      // Sin el menú de "mantener presionado" de iOS sobre las estrellas.
      style={{ WebkitTouchCallout: 'none' }}
    >
      {stars}
    </div>
  )
}
