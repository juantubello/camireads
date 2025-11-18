import { EditReviewForm } from '@/components/edit-review-form'

export default async function EditReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 overflow-y-auto pb-20">
        <EditReviewForm bookId={id} />
      </main>
    </div>
  )
}
