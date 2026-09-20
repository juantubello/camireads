'use client'

import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StarRatingProps {
  rating: number
  onRatingChange?: (rating: number) => void
  readonly?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function StarRating({
  rating,
  onRatingChange,
  readonly = false,
  size = 'md',
}: StarRatingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }
  
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          aria-label={
            readonly ? undefined : `Calificar con ${star} ${star === 1 ? 'estrella' : 'estrellas'}`
          }
          aria-pressed={readonly ? undefined : star <= rating}
          onClick={() => !readonly && onRatingChange?.(star)}
          className={cn(
            'transition-colors',
            // Editable: el target táctil llega a 44px sin agrandar la estrella.
            !readonly && 'flex min-h-11 min-w-11 items-center justify-center hover:scale-110 cursor-pointer',
            readonly && 'cursor-default'
          )}
        >
          <Star
            className={cn(
              sizeClasses[size],
              star <= rating
                ? 'fill-primary text-primary'
                : 'fill-none text-muted-foreground'
            )}
          />
        </button>
      ))}
    </div>
  )
}
