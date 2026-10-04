import { NewReviewForm } from '@/components/new-review-form'

export default function NewReviewPage() {
  return (
    // `h-dvh` en vez de `h-screen`: en Safari iOS `100vh` incluye la barra del
    // navegador, así que la barra de guardado `sticky bottom-0` (que se apoya
    // en la caja de contenido de este <main>) terminaba abajo del área visible.
    <div className="flex flex-col h-dvh md:pt-[65px]">
      {/* El <main> TERMINA arriba de la nav (`mb` = alto exacto de la nav:
          4rem + safe area), en vez de pasarle por debajo con `pb`. Así el
          borde inferior del área con scroll es el techo de la nav y la barra
          de guardado `sticky bottom-0` queda pegada ahí en cualquier motor.
          Con `pb` dependía de que el navegador descontara el padding del
          contenedor al ubicar el sticky, y Safari iOS no lo hace: la barra
          quedaba escondida detrás de la nav hasta llegar al final. */}
      <main className="flex-1 overflow-y-auto mb-[calc(4rem_+_env(safe-area-inset-bottom))] md:mb-0">
        <NewReviewForm />
      </main>
    </div>
  )
}
