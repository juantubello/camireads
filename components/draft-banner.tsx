'use client'

import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDraftTime } from '@/lib/draft-storage'

/**
 * Cartel para recuperar un borrador. Nunca se restaura solo: la usuaria decide.
 */
export function DraftBanner({
  savedAt,
  onRestore,
  onDiscard,
  description = 'Quedó un borrador sin guardar en este navegador.',
}: {
  savedAt: string
  onRestore: () => void
  onDiscard: () => void
  description?: string
}) {
  return (
    <div className="mb-6 rounded-xl border border-border bg-accent/50 p-4">
      <div className="flex items-start gap-3">
        <History className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{description}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Última vez que se guardó solo: {formatDraftTime(savedAt)}.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" className="h-11 px-4" onClick={onRestore}>
              Recuperar borrador
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 px-4"
              onClick={onDiscard}
            >
              Descartar
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
