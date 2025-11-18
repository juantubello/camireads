import { NewReviewForm } from '@/components/new-review-form'
import { BottomNav } from '@/components/bottom-nav'

export default function NewReviewPage() {
  return (
    <div className="flex flex-col h-screen">
      <main className="flex-1 overflow-y-auto pb-20">
        <NewReviewForm />
      </main>
      <BottomNav />
    </div>
  )
}
