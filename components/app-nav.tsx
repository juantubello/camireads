'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, PlusCircle, Search, User } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * `label` es el nombre completo (desktop y lectores de pantalla).
 * `short` es lo que se dibuja en la tab bar del teléfono.
 *
 * Con el cuarto ítem (Perfil) la tab bar pasa de 3 a 4 columnas. A 375px, con
 * el `px-4` del contenedor, cada slot mide (375 - 32) / 4 = **85,75px**.
 * Medido con la tipografía real (Geist 12px semibold, que es el estado activo
 * y el más ancho):
 *
 *   "Mis Reseñas"  72,3px  → 13,4px libres
 *   "Nueva Reseña" 81,6px  → 4,1px libres  ← se toca con la vecina
 *   "Buscar"       40,6px
 *   "Perfil"       30,4px
 *
 * "Nueva Reseña" deja 2px de aire por lado, contra los 8px mínimos entre
 * targets, y con la tipografía de respaldo (`Geist Fallback`, un poco más
 * ancha) se parte en dos renglones y descuadra el alto de la barra.
 *
 * Por eso en mobile las etiquetas pasan a **una sola palabra**:
 *
 *   "Reseñas" 49,1px · "Nueva" 36,2px · "Buscar" 40,6px · "Perfil" 30,4px
 *
 * La más ancha deja **36,6px libres** en su slot, muy por encima del mínimo.
 * El target de cada ítem sigue siendo 85,75 × 64px, bastante más que 44×44.
 * La palabra completa no se pierde: va en el `aria-label` del link y sigue
 * entera en desktop, donde la nav es un header y sobra lugar.
 */
const NAV_ITEMS = [
  { label: 'Mis Reseñas', short: 'Reseñas', href: '/', icon: BookOpen },
  { label: 'Nueva Reseña', short: 'Nueva', href: '/new', icon: PlusCircle },
  { label: 'Buscar', short: 'Buscar', href: '/search', icon: Search },
  { label: 'Perfil', short: 'Perfil', href: '/profile', icon: User, also: ['/sagas/'] },
] as const

/**
 * ¿Este ítem es el de la pantalla actual? Además de la ruta exacta, un ítem
 * puede "adoptar" pantallas hijas que no tienen tab propia: una saga
 * (`/sagas/12`) se abre desde el Perfil, así que en la barra queda marcado
 * Perfil y no ninguno (sin ítem activo la usuaria pierde la referencia).
 */
function isActive(item: (typeof NAV_ITEMS)[number], pathname: string): boolean {
  if (pathname === item.href) return true
  return 'also' in item && item.also.some((prefix) => pathname.startsWith(prefix))
}

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
    active: isActive(item, pathname),
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
              // La etiqueta visible es corta ("Nueva"); el nombre completo va
              // acá para que el lector de pantalla anuncie "Nueva Reseña".
              aria-label={item.label}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 min-w-0 py-2 min-h-[44px] rounded-lg transition-all',
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
              {/* `whitespace-nowrap`: aunque la etiqueta corta entra holgada,
                  esto garantiza que ninguna tipografía de respaldo la parta en
                  dos renglones y descuadre el alto de 64px de la barra. */}
              <span
                aria-hidden="true"
                className={cn(
                  'text-xs whitespace-nowrap transition-all',
                  item.active ? 'font-semibold' : 'font-medium'
                )}
              >
                {item.short}
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
