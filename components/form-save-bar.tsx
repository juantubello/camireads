'use client'

import { AlertCircle, Check, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatDraftTime } from '@/lib/draft-storage'

/** ["título", "autor", "calificación"] -> "título, autor y calificación" */
export function formatMissingList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

/**
 * Barra de guardado pegada abajo.
 *
 * Antes el botón Guardar quedaba al final del formulario: medido en /new con el
 * formulario VACÍO estaba en y=1400 con un viewport de 812. Con una reseña de
 * 28.733 caracteres, mucho peor.
 *
 * - `sticky` sobre la bottom nav en mobile (`4rem` de nav + safe area) y pegada
 *   abajo en desktop, donde la nav es un header arriba.
 * - El botón NUNCA es un botón gris mudo: si falta algo lo dice al lado, y al
 *   tocarlo lleva el foco al primer campo que falta en vez de no hacer nada.
 */
export function FormSaveBar({
  saveLabel,
  missing,
  saving,
  onCancel,
  cancelLabel = 'Cancelar',
  draftSavedAt,
  error,
}: {
  saveLabel: string
  missing: string[]
  saving: boolean
  onCancel: () => void
  cancelLabel?: string
  draftSavedAt?: string | null
  error?: string | null
}) {
  const incomplete = missing.length > 0

  return (
    <div
      className={cn(
        'sticky bottom-0 z-30 -mx-5 mt-2 border-t border-border bg-background/95 px-5 py-3 backdrop-blur',
        // `bottom-0` alcanza: el <main> de la página ya reserva abajo
        // `5rem + env(safe-area-inset-bottom)` para la bottom nav del iPhone, y
        // el rectángulo que limita a un sticky es la CAJA DE CONTENIDO del
        // contenedor con scroll. O sea que la barra queda justo arriba de la
        // nav y del home indicator, sin sumar el inset dos veces.
      )}
    >
      {error && (
        <p
          role="alert"
          className="mb-2 flex items-start gap-2 text-sm font-medium text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {!error && incomplete && (
        <p className="mb-2 flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Para guardar falta{' '}
            <span className="font-medium text-foreground">
              {formatMissingList(missing)}
            </span>
            .
          </span>
        </p>
      )}

      {!error && !incomplete && draftSavedAt && (
        <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 shrink-0" />
          Borrador guardado {formatDraftTime(draftSavedAt)}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-none px-5"
          onClick={onCancel}
          disabled={saving}
        >
          {cancelLabel}
        </Button>

        <Button
          type="submit"
          // No usamos `disabled`: un botón gris que no explica nada es
          // justamente el problema que veníamos a arreglar. Con `aria-disabled`
          // el botón sigue siendo focusable y, al tocarlo, el formulario lleva
          // el foco al primer campo que falta.
          aria-disabled={incomplete || saving}
          disabled={saving}
          className={cn(
            'h-12 flex-1 text-base font-semibold',
            incomplete && 'opacity-60',
          )}
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              <Save className="mr-2 h-5 w-5" />
              {saveLabel}
              <span className="ml-2 hidden text-xs font-normal opacity-70 md:inline">
                ⌘S
              </span>
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
