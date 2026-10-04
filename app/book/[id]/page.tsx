import { BookDetail } from '@/components/book-detail'

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    // `h-dvh` en vez de `h-screen`: en Safari iOS `100vh` incluye la barra del
    // navegador y el contenedor termina más abajo del área visible.
    <div className="flex flex-col h-dvh md:pt-[65px]">
      {/* pb = alto real de la nav (64px + 1px de borde + safe-area) + 31px de
          respiro. Ver el comentario largo en `app/page.tsx`. */}
      <main className="flex-1 overflow-y-auto pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:pb-8">
        <BookDetail bookId={id} />
      </main>
    </div>
  )
}
