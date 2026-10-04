import { ProfileScreen } from '@/components/profile-screen'

export default function ProfilePage() {
  return (
    // Misma estructura que el inicio y el detalle: `h-dvh` (no `h-screen`,
    // que en Safari iOS mide de más) y el scroll dentro del `<main>`.
    <div className="flex flex-col h-dvh md:pt-[65px]">
      {/* pb = 64px de nav + 1px de borde + el home indicator del iPhone
          (`env(safe-area-inset-bottom)`) + 31px de aire. Ver `app/page.tsx`. */}
      <main className="flex-1 overflow-y-auto pb-[calc(6rem_+_env(safe-area-inset-bottom))] md:pb-8">
        <ProfileScreen />
      </main>
    </div>
  )
}
