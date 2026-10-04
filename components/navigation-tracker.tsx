'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { syncNavigationDepth } from '@/lib/navigation'

/**
 * Mantiene a `lib/navigation` dentro del bundle del layout, que es lo que hace
 * que su `install()` corra en TODAS las rutas — y encima de eso resincroniza en
 * cada cambio de ruta como red de seguridad.
 *
 * Ojo con el orden, que es justamente el bug que se arregló acá: la cuenta de
 * profundidad NO se lleva en este efecto. Un passive effect corre después de
 * hidratar, y el usuario puede tocar un libro antes: cuando eso pasaba, la
 * primera corrida del efecto veía la ruta de DESTINO y la marcaba como "primera
 * entrada de la carga" (profundidad 0). Ahora la cuenta se hace de forma
 * sincrónica en `lib/navigation.ts` (etiqueta al evaluar el módulo + wrappers
 * de `history.pushState`/`replaceState` + `popstate`), así que este efecto no
 * tiene nada que corregir: es idempotente y sólo confirma la etiqueta.
 *
 * Solo mira `usePathname()` a propósito: `useSearchParams()` obligaría a
 * envolver el layout entero en un Suspense y los cambios de query (los filtros
 * de /search) no cambian de pantalla.
 */
export function NavigationTracker() {
  const pathname = usePathname()

  useEffect(() => {
    syncNavigationDepth()
  }, [pathname])

  return null
}
