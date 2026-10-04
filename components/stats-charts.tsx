'use client'

import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatNumber, type CountPoint } from '@/lib/stats'

/**
 * Gráficos del Perfil.
 *
 * ── Por qué HTML/CSS y no SVG ni Recharts ──────────────────────────────────
 * El requisito duro es que **los números se lean a 375px**. En SVG el texto
 * escala con el `viewBox`, así que "10px" no son 10px reales y hay que medirlo
 * a mano en cada ancho; con HTML el `font-size` es literal y el `md:` de
 * Tailwind lo sube en desktop sin cuentas. Recharts, además, no deja poner una
 * etiqueta por barra sin pelearse con el layout responsive y suma ~100 KB al
 * bundle para 12 barras.
 *
 * ── Desvío consciente de la skill `dataviz` ───────────────────────────────
 * La skill dice "nunca un número en cada punto" (satura y no se lee). Acá se
 * etiqueta **todas** las barras porque es un pedido textual del dueño y porque
 * en este caso los números SON la historia: son 12-13 barras, no 200 puntos, y
 * sin el número no hay forma de saber que noviembre de 2022 fueron 50 libros.
 * El resto de la skill sí se respeta: una sola serie (sin problemas de
 * daltonismo), barras finas con punta redondeada de 4px y base cuadrada,
 * separación de 2px entre vecinas, grilla recesiva y vista de tabla.
 */

/* ------------------------------------------------------------------ */
/* Marco común                                                         */
/* ------------------------------------------------------------------ */

export function ChartCard({
  title,
  description,
  footnote,
  children,
  tableCaption,
  rows,
  valueHeader = 'Libros',
  keyHeader = 'Período',
}: {
  title: string
  description?: string
  footnote?: ReactNode
  children: ReactNode
  tableCaption: string
  rows: Array<{ label: string; value: number }>
  valueHeader?: string
  keyHeader?: string
}) {
  return (
    <section className="camireads-viz rounded-xl border border-border bg-card p-4">
      <header className="mb-4">
        <h3 className="font-serif text-base font-bold text-foreground">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        )}
      </header>

      {children}

      {footnote && (
        <p className="mt-3 border-t border-border pt-3 text-[11px] leading-snug text-muted-foreground">
          {footnote}
        </p>
      )}

      {/* Vista de tabla: es lo que hace que el gráfico no sea la única manera
          de llegar al dato (lectores de pantalla, y quien quiera el número
          exacto sin apuntarle a una barra de 24px). */}
      <details className="mt-2 group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          <span className="group-open:hidden">Ver los números en una tabla</span>
          <span className="hidden group-open:inline">Ocultar la tabla</span>
        </summary>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{tableCaption}</caption>
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {keyHeader}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {valueHeader}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">
                    {row.label}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatNumber(row.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Columnas (meses del año)                                            */
/* ------------------------------------------------------------------ */

/**
 * Columnas verticales con el número ARRIBA de la barra.
 *
 * El número va afuera, no adentro: a 375px cada columna mide ~26px y el relleno
 * es claro, así que un número blanco adentro no contrasta y uno oscuro se
 * pierde. Arriba, sobre el fondo de la tarjeta, usa el token de texto y se lee
 * siempre. La altura reservada para esa etiqueta (`pt`) es lo que evita que la
 * barra más alta se la coma.
 */
export function ColumnChart({
  points,
  highlightMax = true,
  ariaLabel,
}: {
  points: CountPoint[]
  highlightMax?: boolean
  ariaLabel: string
}) {
  const max = Math.max(1, ...points.map((p) => p.value))

  return (
    <div role="img" aria-label={ariaLabel}>
      {/* pt-4 = el renglón del número de la barra más alta (100%).
          h-[132px] es el área de las barras. En desktop todo crece. */}
      <div className="flex items-end gap-[2px] pt-4 md:pt-5">
        {points.map((point) => {
          const pct = (point.value / max) * 100
          const isMax = highlightMax && point.value === max
          return (
            <div
              key={point.label}
              className="flex h-[132px] min-w-0 flex-1 flex-col justify-end md:h-[180px]"
              title={point.fullLabel ?? `${point.label}: ${point.value}`}
            >
              <div
                className="relative mx-auto w-full max-w-[24px] md:max-w-[36px]"
                // Mínimo visible: una barra de 2px sigue diciendo "hubo algo".
                style={{ height: `${point.value === 0 ? 0 : Math.max(pct, 1.5)}%` }}
              >
                <span
                  className={cn(
                    // 10px en mobile (no 9: entra igual y se lee bastante
                    // mejor), 12px de md: para arriba.
                    'absolute bottom-full left-1/2 -translate-x-1/2 -mb-px text-[10px] leading-4 tabular-nums md:text-xs',
                    isMax
                      ? 'font-bold text-foreground'
                      : 'font-medium text-muted-foreground',
                  )}
                >
                  {formatNumber(point.value)}
                </span>
                {/* Punta redondeada de 4px, base cuadrada: la barra nace de la
                    línea de base y no flota. */}
                <div
                  className="h-full w-full rounded-t-[4px]"
                  style={{
                    backgroundColor: 'var(--viz-series)',
                    opacity: isMax ? 1 : 0.82,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Línea de base: hairline sólida, un paso del fondo. Nunca punteada. */}
      <div className="h-px w-full" style={{ backgroundColor: 'var(--viz-grid)' }} />

      <div className="flex gap-[2px] pt-1.5">
        {points.map((point) => (
          <div
            key={point.label}
            className="min-w-0 flex-1 text-center text-[10px] leading-tight text-muted-foreground md:text-xs"
          >
            {point.label}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Barras horizontales (años, ratings)                                 */
/* ------------------------------------------------------------------ */

/**
 * Barras horizontales: etiqueta a la izquierda, valor en la punta.
 *
 * Para los 13 años esto gana por lejos contra las columnas: "2023" son 4
 * caracteres que no entran cómodos en una columna de 26px a 375px, mientras que
 * acostado el nombre tiene todo el renglón. Además la lista crece sin achicar
 * nada cuando pase un año más.
 */
export function BarRowChart({
  points,
  ariaLabel,
  labelWidthClass = 'w-10 md:w-14',
  highlightMax = true,
  renderLabel,
}: {
  points: CountPoint[]
  ariaLabel: string
  labelWidthClass?: string
  highlightMax?: boolean
  renderLabel?: (point: CountPoint) => ReactNode
}) {
  const max = Math.max(1, ...points.map((p) => p.value))
  const id = useId()

  return (
    <ul role="img" aria-label={ariaLabel} className="space-y-1.5">
      {points.map((point) => {
        const pct = (point.value / max) * 100
        const isMax = highlightMax && point.value === max
        return (
          <li
            key={`${id}-${point.label}`}
            className="flex items-center gap-2"
            title={point.fullLabel ?? `${point.label}: ${point.value}`}
          >
            <span
              className={cn(
                'shrink-0 text-[11px] leading-5 tabular-nums md:text-xs',
                labelWidthClass,
                isMax ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {renderLabel ? renderLabel(point) : point.label}
            </span>

            {/* SIN pista de fondo a propósito. Con una pista pintada del mismo
                tono, 2013 (1 libro de 321) se veía como una barra clara que
                ocupaba todo el renglón: de reojo leías "2013 fue un año enorme"
                cuando la barra real medía 1px. La barra vive sobre la
                superficie de la tarjeta y mide exactamente lo que vale. */}
            <span className="relative h-5 min-w-0 flex-1 md:h-6">
              <span
                className="absolute inset-y-0 left-0 rounded-[4px]"
                style={{
                  // `min-width` de 3px: un valor chico pero real tiene que
                  // dejar una marca visible, no desaparecer del todo.
                  width: `${point.value === 0 ? 0 : pct}%`,
                  minWidth: point.value === 0 ? 0 : '3px',
                  backgroundColor: 'var(--viz-series)',
                  opacity: isMax ? 1 : 0.82,
                }}
              />
            </span>

            <span
              className={cn(
                'w-9 shrink-0 text-right text-[11px] leading-5 tabular-nums md:w-12 md:text-sm',
                isMax ? 'font-bold text-foreground' : 'font-medium text-foreground/80',
              )}
            >
              {formatNumber(point.value)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
