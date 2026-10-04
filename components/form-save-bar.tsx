'use client'

import { AlertCircle, Check, Loader2, Save, TriangleAlert } from 'lucide-react'
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
  draftError,
  error,
}: {
  saveLabel: string
  missing: string[]
  saving: boolean
  onCancel: () => void
  cancelLabel?: string
  draftSavedAt?: string | null
  /** El autosave no pudo escribir en el navegador. Se muestra SIEMPRE. */
  draftError?: string | null
  error?: string | null
}) {
  const incomplete = missing.length > 0

  return (
    <div
      className={cn(
        'sticky bottom-0 z-30 -mx-5 mt-2 border-t border-border bg-background/95 px-5 py-3 backdrop-blur',
        // `bottom-0` alcanza: las páginas de formulario le ponen al <main>
        // con scroll un `mb` igual al alto de la bottom nav, así que el borde
        // inferior del área con scroll ya es el techo de la nav. No usar `pb`
        // para esto: Safari iOS no descuenta el padding del contenedor al
        // ubicar un sticky y la barra queda tapada por la nav.
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

      {/* El fallo del autosave va aparte del error de guardado y NO lo tapa
          "Para guardar falta…": mientras escribe, al formulario casi siempre le
          falta algún campo obligatorio, así que condicionarlo a `!incomplete`
          era esconder justo el aviso que importa. */}
      {draftError && (
        <p
          role="alert"
          className="mb-2 flex items-start gap-2 text-sm font-medium text-destructive"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{draftError}</span>
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

      {/* Mismo motivo: el tilde del borrador se muestra aunque falten campos.
          Lo que NO puede pasar es mostrarlo cuando el guardado falló. */}
      {!draftError && draftSavedAt && (
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
