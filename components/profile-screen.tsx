'use client'

import { useEffect, useRef, useState } from 'react'
import { ProfileHeader } from '@/components/profile-header'
import { SagaList } from '@/components/saga-list'
import { StatsPanel } from '@/components/stats-panel'
import { TagManager } from '@/components/tag-manager'
import { cn } from '@/lib/utils'

type TabId = 'numeros' | 'sagas' | 'tags'

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'numeros', label: 'Mis números' },
  { id: 'sagas', label: 'Mis sagas' },
  { id: 'tags', label: 'Mis tags' },
]

/**
 * Solapa elegida, recordada en `sessionStorage`. Sin esto, entrar a una saga y
 * volver devolvía a "Mis números" (la pantalla se monta de nuevo) y había que
 * tocar "Mis sagas" otra vez cada vez. Es una comodidad por pestaña: si falla
 * (modo privado, storage bloqueado), simplemente arranca en la primera.
 */
const TAB_STORAGE_KEY = 'camireads:profile-tab'

function isTabId(value: unknown): value is TabId {
  return TABS.some((t) => t.id === value)
}

/**
 * Pantalla de Perfil: foto arriba, y abajo tres solapas (números, sagas, tags).
 *
 * ¿Por qué solapas y no un scroll largo? Apiladas, las métricas (la cifra
 * grande, 4 tarjetas, 2 destacados, 3 gráficos) más el ABM de tags dan más de
 * 3000px de scroll a 375px, y el ABM —que es lo que se usa para *hacer* algo,
 * no para mirar— queda enterrado abajo del todo. Con dos solapas cada panel
 * entra en dos o tres pantallazos. Las dos se montan/desmontan, así que la
 * lista de tags se refresca sola al volver.
 */
export function ProfileScreen() {
  const [tab, setTabState] = useState<TabId>('numeros')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Se lee después de montar (no en el estado inicial) para que el HTML del
  // server y el primer render del cliente coincidan.
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(TAB_STORAGE_KEY)
      if (isTabId(saved)) setTabState(saved)
    } catch {
      // sin storage: arranca en la primera solapa
    }
  }, [])

  function setTab(id: TabId) {
    setTabState(id)
    try {
      window.sessionStorage.setItem(TAB_STORAGE_KEY, id)
    } catch {
      // idem
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const index = TABS.findIndex((t) => t.id === tab)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else return

    event.preventDefault()
    const id = TABS[next].id
    setTab(id)
    tabRefs.current[id]?.focus()
  }

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-2xl md:max-w-5xl xl:max-w-6xl mx-auto">
      <ProfileHeader />

      <div
        role="tablist"
        aria-label="Secciones del perfil"
        onKeyDown={onKeyDown}
        className="mt-6 grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/50 p-1"
      >
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[item.id] = el
              }}
              type="button"
              role="tab"
              id={`profile-tab-${item.id}`}
              aria-selected={active}
              aria-controls={`profile-panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(item.id)}
              className={cn(
                'min-h-11 rounded-lg px-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id={`profile-panel-${tab}`}
        aria-labelledby={`profile-tab-${tab}`}
        tabIndex={0}
        className="mt-4 focus-visible:outline-none"
      >
        {tab === 'numeros' ? <StatsPanel /> : tab === 'sagas' ? <SagaList /> : <TagManager />}
      </div>
    </div>
  )
}
