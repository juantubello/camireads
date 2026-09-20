import { ReviewList } from '@/components/review-list'

export default function HomePage() {
  return (
    <div className="flex flex-col h-screen">
      {/* pb: deja lugar a la tab bar (64px) + home indicator del iPhone.
          En desktop la nav pasa a ser header fijo => pb chico y pt-16. */}
      <main className="flex-1 overflow-y-auto pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-8 md:pt-16">
        <ReviewList />
      </main>
    </div>
  )
}
