import { BookDetail } from '@/components/book-detail'
import { BottomNav } from '@/components/bottom-nav'

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  
  return (
    <div className="flex flex-col h-screen">
      <main className="flex-1 overflow-y-auto pb-20">
        <BookDetail bookId={id} />
      </main>
      <BottomNav />
    </div>
  )
}
