import { ReviewList } from '@/components/review-list'

export default function HomePage() {
  return (
    // `h-dvh`, no `h-screen`: en Safari iOS `100vh` incluye la barra del
    // navegador, así que el contenedor queda más alto que el área visible y el
    // final del scroll se esconde abajo. `100dvh` sigue al área visible real.
    <div className="flex flex-col h-dvh md:pt-[65px]">
      {/* pb: la tab bar mide 64px + 1px de borde + el home indicator del iPhone
          (`env(safe-area-inset-bottom)`, 34px en los modelos con notch). Con
          `5rem` (80px) el último elemento quedaba a 15px de la nav — al filo, y
          cualquier redondeo lo tapaba. Con `6rem` (96px) quedan 31px de aire
          por encima de la nav, que no dependen del inset porque este suma de
          los dos lados. En desktop la nav pasa a ser header fijo => pb chico. */}
      <main className="flex-1 overflow-y-auto pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:pb-8">
        <ReviewList />
      </main>
    </div>
  )
}
