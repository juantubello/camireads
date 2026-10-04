import { EditReviewForm } from '@/components/edit-review-form'

export default async function EditReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    // `h-dvh` en vez de `h-screen`: mismo motivo que en `/new`. Con `100vh` en
    // iOS el <main> es más alto que el área visible y la barra de guardado
    // `sticky bottom-0` queda debajo de la barra del navegador.
    <div className="flex flex-col h-dvh md:pt-[65px]">
      {/* El <main> TERMINA arriba de la nav (`mb` = alto exacto de la nav:
          4rem + safe area), en vez de pasarle por debajo con `pb`. Así el
          borde inferior del área con scroll es el techo de la nav y la barra
          de guardado `sticky bottom-0` queda pegada ahí en cualquier motor.
          Con `pb` dependía de que el navegador descontara el padding del
          contenedor al ubicar el sticky, y Safari iOS no lo hace: la barra
          quedaba escondida detrás de la nav hasta llegar al final. */}
      <main className="flex-1 overflow-y-auto mb-[calc(4rem_+_env(safe-area-inset-bottom))] md:mb-0">
        <EditReviewForm bookId={id} />
      </main>
    </div>
  )
}
