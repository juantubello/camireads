'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, PlusCircle, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'Mis Reseñas', href: '/', icon: BookOpen },
  { label: 'Nueva Reseña', href: '/new', icon: PlusCircle },
  { label: 'Buscar', href: '/search', icon: Search },
] as const

/**
 * Navegación principal de la app.
 *
 * - `< md`  : tab bar fija abajo (el diseño mobile de siempre, intacto).
 * - `>= md` : header horizontal fijo arriba.
 *
 * Las dos variantes se renderizan siempre y se alternan solo con CSS
 * (`md:hidden` / `hidden md:block`), así no hay lectura de `window` en el
 * cliente ni desajustes de hidratación.
 */
export function AppNav() {
  const pathname = usePathname()
  const items = NAV_ITEMS.map((item) => ({
    ...item,
    active: pathname === item.href,
  }))

  return (
    <>
      {/* ---------- Mobile: bottom tab bar ---------- */}
      {/* El padding inferior con env() reserva el home indicator del iPhone.
          En navegadores sin notch env() vale 0 => idéntico al diseño previo. */}
      <nav
        aria-label="Navegación principal"
        className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="flex justify-around items-center h-16 max-w-2xl mx-auto px-4">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 py-2 min-h-[44px] rounded-lg transition-all',
                item.active
                  ? 'text-primary scale-105'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}
            >
              <div className="relative">
                <item.icon
                  aria-hidden="true"
                  className={cn(
                    'h-6 w-6 transition-all',
                    item.active && 'drop-shadow-sm'
                  )}
                />
                {item.active && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
                )}
              </div>
              <span
                className={cn(
                  'text-xs transition-all',
                  item.active ? 'font-semibold' : 'font-medium'
                )}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>

      {/* ---------- Desktop: header horizontal ---------- */}
      <header className="hidden md:block fixed top-0 left-0 right-0 bg-card border-b border-border z-50">
        <div className="flex items-center justify-between gap-6 h-16 max-w-5xl xl:max-w-6xl mx-auto px-6">
          <Link
            href="/"
            className="font-serif text-xl font-bold text-foreground rounded-lg px-1 py-2 transition-colors hover:text-primary"
          >
            CamiReads
          </Link>

          <nav aria-label="Navegación principal" className="flex items-center gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg text-sm transition-all',
                  item.active
                    ? 'text-primary font-semibold bg-accent/60'
                    : 'text-muted-foreground font-medium hover:text-foreground hover:bg-accent'
                )}
              >
                <item.icon aria-hidden="true" className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>
    </>
  )
}
