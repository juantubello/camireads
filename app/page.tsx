import { ReviewList } from '@/components/review-list'
import { BottomNav } from '@/components/bottom-nav'

export default function HomePage() {
  return (
    <div className="flex flex-col h-screen">
      <main className="flex-1 overflow-y-auto pb-20">
        <ReviewList />
      </main>
      <BottomNav />
    </div>
  )
}
