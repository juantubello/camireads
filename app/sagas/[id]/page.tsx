import { SagaDetailScreen } from '@/components/saga-detail'

export default async function SagaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    // Mismo esqueleto que el detalle del libro y el perfil: `h-dvh` (no
    // `h-screen`, que en Safari iOS mide de más) y el scroll dentro del `<main>`.
    <div className="flex flex-col h-dvh md:pt-[65px]">
      {/* pb = 64px de nav + 1px de borde + safe-area + 31px de aire. Ver `app/page.tsx`. */}
      <main className="flex-1 overflow-y-auto pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:pb-8">
        <SagaDetailScreen sagaId={id} />
      </main>
    </div>
  )
}
