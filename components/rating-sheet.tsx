'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { StarRating } from '@/components/star-rating'
import { formatRating, isRated, snapToQuarter } from '@/lib/rating'

interface RatingSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Calificación guardada (0 = sin calificar). Es el punto de partida al abrir. */
  value: number
  /** Se llama SOLO al tocar "Listo", con el valor ajustado (0 si se borró). */
  onConfirm: (value: number) => void
  /** Ej. el título del libro, para que quede claro qué se está puntuando. */
  description?: string
}

/**
 * Hoja inferior para calificar en cuartos (referencia: "Your rating" de
 * StoryGraph). Mientras se ajusta, el valor vive acá adentro: cerrar la hoja
 * deslizándola o tocando afuera NO guarda nada; solo "Listo" confirma.
 */
export function RatingSheet({
  open,
  onOpenChange,
  value,
  onConfirm,
  description,
}: RatingSheetProps) {
  const [draft, setDraft] = useState(() => snapToQuarter(value))
  // Cada vez que se abre, arranca desde lo guardado (y no desde lo que quedó
  // de la vez anterior que se cerró sin confirmar). Se hace durante el render
  // comparando con el valor previo, como recomienda React, sin un useEffect
  // que pinte primero el valor viejo.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(snapToQuarter(value))
  }

  const rated = isRated(draft)

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-sm pb-[env(safe-area-inset-bottom)]">
          <DrawerHeader className="text-center md:text-center">
            <DrawerTitle className="text-xl">Tu calificación</DrawerTitle>
            <DrawerDescription>
              Deslizá o tocá para ajustar en cuartos de estrella
              {description ? (
                <span className="mt-1 block truncate font-medium text-foreground/80">
                  {description}
                </span>
              ) : null}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col items-center gap-4 px-4 pt-2 pb-2">
            {/* El número grande es lo que Camila pidió ver: "3.50", no "3,5".
                Sin aria-live: el slider ya anuncia "3.50 de 5 estrellas" y
                repetirlo acá lo haría hablar dos veces. Va en la sans (Geist) y no en la serif: la
                serif del sistema en iOS dibuja el punto a media altura ("3·50"). */}
            <div className="text-center" aria-hidden="true">
              <p className="text-6xl font-bold leading-none tracking-tight tabular-nums text-foreground">
                {rated ? formatRating(draft) : '—'}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {rated ? 'de 5' : 'Sin calificar'}
              </p>
            </div>

            <StarRating
              rating={draft}
              onRatingChange={setDraft}
              size="xl"
              aria-label="Tu calificación"
              className="py-2"
            />
          </div>

          <DrawerFooter className="gap-1">
            <Button
              type="button"
              className="h-12 w-full text-base"
              onClick={() => onConfirm(draft)}
            >
              Listo
            </Button>
            {/* "Borrar" solo deja el borrador en 0: igual hay que tocar Listo.
                Así un toque de más no se lleva puesta una calificación.
                Queda siempre en su lugar (deshabilitado en 0) para que la
                hoja no salte de alto al borrar. */}
            <Button
              type="button"
              variant="link"
              className="h-11 w-full text-muted-foreground"
              onClick={() => setDraft(0)}
              disabled={!rated}
            >
              Borrar calificación
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
