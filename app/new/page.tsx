import { NewReviewForm } from '@/components/new-review-form'

export default function NewReviewPage() {
  return (
    <div className="flex flex-col h-screen">
      <main className="flex-1 overflow-y-auto pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-8 md:pt-16">
        <NewReviewForm />
      </main>
    </div>
  )
}
