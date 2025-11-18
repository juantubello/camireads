'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, PlusCircle, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BottomNav() {
  const pathname = usePathname()
  
  const navItems = [
    {
      label: 'Mis Reseñas',
      href: '/',
      icon: BookOpen,
      active: pathname === '/',
    },
    {
      label: 'Nueva Reseña',
      href: '/new',
      icon: PlusCircle,
      active: pathname === '/new',
    },
    {
      label: 'Buscar',
      href: '/search',
      icon: Search,
      active: pathname === '/search',
    },
  ]
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex justify-around items-center h-16 max-w-2xl mx-auto px-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-lg transition-all',
              item.active
                ? 'text-primary scale-105'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <div className="relative">
              <item.icon className={cn(
                'h-6 w-6 transition-all',
                item.active && 'drop-shadow-sm'
              )} />
              {item.active && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
              )}
            </div>
            <span className={cn(
              'text-xs transition-all',
              item.active ? 'font-semibold' : 'font-medium'
            )}>
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
