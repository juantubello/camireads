import { EditReviewForm } from '@/components/edit-review-form'

export default async function EditReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div className="flex flex-col h-screen">
      <main className="flex-1 overflow-y-auto pb-[calc(5rem_+_env(safe-area-inset-bottom))] md:pb-8 md:pt-16">
        <EditReviewForm bookId={id} />
      </main>
    </div>
  )
}
