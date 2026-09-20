import { NewReviewForm } from '@/components/new-review-form'

export default function NewReviewPage() {
  return (
    <div className="flex flex-col h-screen md:pt-[65px]">
      <main className="flex-1 overflow-y-auto pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-0">
        <NewReviewForm />
      </main>
    </div>
  )
}
