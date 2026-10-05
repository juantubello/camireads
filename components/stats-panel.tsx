'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Info, Loader2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BarRowChart, ChartCard, ColumnChart } from '@/components/stats-charts'
import {
  MONTH_FULL,
  fetchStats,
  formatAsOf,
  formatNumber,
  type Coverage,
  type Stats,
} from '@/lib/stats'

/**
 * Métricas de lectura.
 *
 * ── Honestidad con los datos (no es decoración) ───────────────────────────
 * El endpoint manda `temporalCoverage`: 1145 libros con fecha de fin y **799
 * sin** (el 41%). Todo lo temporal —por año, por mes, este año contra el
 * anterior— dibuja 1145 libros, no 1944. Y las páginas salen de la importación
 * de Goodreads: cubren 1011 libros. Los dos bloques llevan su línea de
 * cobertura pegada al gráfico, con el número exacto. Discreta, pero siempre
 * visible: nunca atrás de un tooltip ni de un "ver más".
 */
export function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null)
      const data = await fetchStats(signal)
      if (signal?.aborted) return
      setStats(data)
    } catch (err) {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : 'No pude traer tus métricas.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Contando tus libros…
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm">
        <p className="font-medium text-foreground">
          Todavía no puedo mostrarte tus números.
        </p>
        <p className="mt-1 text-muted-foreground">{error}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11"
          onClick={() => {
            setLoading(true)
            void load()
          }}
        >
          Reintentar
        </Button>
      </div>
    )
  }

  const { totals, datedCoverage, pages } = stats
  const partialDates =
    datedCoverage !== null && datedCoverage.included < datedCoverage.total

  return (
    <div className="space-y-4">
      {/* ---------------- la cifra principal ---------------- */}
      {totals.books !== null && (
        <section className="rounded-xl border border-border bg-card p-5 text-center">
          <p className="text-sm text-muted-foreground">Libros leídos</p>
          <p className="mt-1 text-5xl font-semibold leading-none text-foreground">
            {formatNumber(totals.books)}
          </p>
          {totals.reviews !== null && (
            <p className="mt-2 text-sm text-muted-foreground">
              con {formatNumber(totals.reviews)}{' '}
              {totals.reviews === 1 ? 'reseña escrita' : 'reseñas escritas'}
            </p>
          )}
        </section>
      )}

      {/* ---------------- tarjetas chicas ---------------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Páginas"
          value={pages.total}
          note={
            pages.coverage
              ? `de ${formatNumber(pages.coverage.included)} libros`
              : undefined
          }
        />
        <StatTile label="Autores distintos" value={totals.authors} />
        <StatTile label="Frases guardadas" value={totals.quotes} />
        <StatTile
          label="Páginas por libro"
          value={pages.average !== null ? Math.round(pages.average) : null}
          note="promedio"
        />
      </div>

      {pages.coverage && pages.coverage.included < pages.coverage.total && (
        <CoverageNote>
          Las páginas salen de{' '}
          <strong className="font-semibold text-foreground">
            {formatNumber(pages.coverage.included)} de {formatNumber(pages.coverage.total)}{' '}
            libros
          </strong>
          : el número de páginas vino con la importación de Goodreads, así que los
          libros que cargaste a mano no lo tienen.
        </CoverageNote>
      )}

      {/* ---------------- destacados ---------------- */}
      {(stats.topAuthor || stats.mostQuotedBook) && (
        <div className="grid gap-3 md:grid-cols-2">
          {stats.topAuthor && (
            <HighlightCard
              label="Tu autora más leída"
              headline={stats.topAuthor.name}
              detail={`${formatNumber(stats.topAuthor.count)} ${
                stats.topAuthor.count === 1 ? 'libro' : 'libros'
              }`}
            />
          )}
          {stats.mostQuotedBook && (
            <HighlightCard
              label="El libro que más te marcó"
              headline={stats.mostQuotedBook.title}
              detail={`${formatNumber(stats.mostQuotedBook.quotes)} ${
                stats.mostQuotedBook.quotes === 1 ? 'frase guardada' : 'frases guardadas'
              }${stats.mostQuotedBook.author ? ` · ${stats.mostQuotedBook.author}` : ''}`}
              href={stats.mostQuotedBook.id ? `/book/${stats.mostQuotedBook.id}` : undefined}
            />
          )}
        </div>
      )}

      {/* ---------------- este año contra el anterior ---------------- */}
      {stats.yearToDate && <YearToDateCard ytd={stats.yearToDate} />}

      {/* ---------------- por año ---------------- */}
      {stats.byYear.length > 0 && (
        <ChartCard
          title="Libros por año"
          description={
            datedCoverage
              ? `${formatNumber(datedCoverage.included)} libros con fecha de lectura`
              : undefined
          }
          tableCaption="Cantidad de libros terminados por año"
          keyHeader="Año"
          rows={stats.byYear.map((p) => ({ label: p.label, value: p.value }))}
          footnote={partialDates ? <MissingDatesNote coverage={datedCoverage!} /> : undefined}
        >
          <BarRowChart
            points={stats.byYear}
            ariaLabel="Libros terminados por año"
            labelWidthClass="w-8 md:w-12"
          />
        </ChartCard>
      )}

      {/* ---------------- por mes del año ---------------- */}
      {stats.byMonth.length > 0 && (
        <ChartCard
          title="En qué meses leés más"
          description="Todos los años sumados, mes a mes"
          tableCaption="Cantidad de libros terminados por mes del año, sumando todos los años"
          keyHeader="Mes"
          rows={stats.byMonth.map((p) => ({ label: p.label, value: p.value }))}
          footnote={
            <>
              {stats.bestMonth && (
                <>
                  Tu mejor mes fue{' '}
                  <strong className="font-semibold text-foreground">
                    {MONTH_FULL[stats.bestMonth.month - 1]} de {stats.bestMonth.year}
                  </strong>
                  , con {formatNumber(stats.bestMonth.count)} libros.{' '}
                </>
              )}
              {partialDates && <MissingDatesNote coverage={datedCoverage!} />}
            </>
          }
        >
          <ColumnChart
            points={stats.byMonth}
            ariaLabel="Libros terminados por mes del año, sumando todos los años"
          />
        </ChartCard>
      )}

      {/* ---------------- ratings ---------------- */}
      {stats.ratings.distribution.length > 0 && <RatingsCard stats={stats} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function StatTile({
  label,
  value,
  note,
}: {
  label: string
  value: number | null
  note?: string
}) {
  if (value === null) return null
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-2xl font-semibold leading-tight text-foreground">
        {formatNumber(value)}
      </p>
      <p className="mt-0.5 text-xs font-medium text-foreground/80">{label}</p>
      {note && (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{note}</p>
      )}
    </div>
  )
}

function HighlightCard({
  label,
  headline,
  detail,
  href,
}: {
  label: string
  headline: string
  detail: string
  href?: string
}) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-serif text-lg font-bold leading-snug text-foreground">
        {headline}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    )
  }

  return <div className="rounded-xl border border-border bg-card p-4">{body}</div>
}

function YearToDateCard({ ytd }: { ytd: NonNullable<Stats['yearToDate']> }) {
  const delta = ytd.booksThisYear - ytd.previousYearSameDate
  const asOf = formatAsOf(ytd.asOf)

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-serif text-base font-bold text-foreground">
        {ytd.year} contra {ytd.previousYear}
      </h3>
      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
        {asOf
          ? `Los dos años contados hasta el ${asOf}, para que la comparación sea a la misma altura.`
          : 'Los dos años contados hasta la misma altura, no el año entero.'}
      </p>

      {/* Dos números con un delta, no dos barras de colores distintos: la
          historia acá es la diferencia, y un gráfico de dos barras para dos
          valores es ruido (y una segunda serie de color que nadie necesita). */}
      <div className="mt-3 flex items-end gap-5">
        <div>
          <p className="text-3xl font-semibold leading-none text-foreground">
            {formatNumber(ytd.booksThisYear)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">en {ytd.year}</p>
        </div>
        <div className="pb-0.5">
          <p className="text-xl font-medium leading-none text-muted-foreground">
            {formatNumber(ytd.previousYearSameDate)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            en {ytd.previousYear} a esta altura
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-snug text-foreground">
        {delta === 0 ? (
          <>Vas igual que el año pasado a esta altura.</>
        ) : (
          <>
            Vas{' '}
            <strong className="font-semibold">
              {delta > 0 ? '+' : '−'}
              {formatNumber(Math.abs(delta))}{' '}
              {Math.abs(delta) === 1 ? 'libro' : 'libros'}
            </strong>{' '}
            {delta > 0 ? 'por encima' : 'por debajo'} del año pasado a esta altura.
          </>
        )}
        {ytd.previousYearTotal !== null && (
          <>
            {' '}
            <span className="text-muted-foreground">
              ({ytd.previousYear} terminó con {formatNumber(ytd.previousYearTotal)}.)
            </span>
          </>
        )}
      </p>
    </section>
  )
}

function RatingsCard({ stats }: { stats: Stats }) {
  const { distribution, average, rated, unrated } = stats.ratings

  const points = distribution.map((r) => ({
    label: String(r.rating),
    fullLabel: `${formatNumber(r.count)} libros con ${r.rating} ${
      r.rating === 1 ? 'estrella' : 'estrellas'
    }`,
    value: r.count,
  }))

  const rows = points.map((p) => ({ label: `${p.label} ★`, value: p.value }))
  if (unrated) rows.push({ label: 'Sin calificar', value: unrated })

  return (
    <ChartCard
      title="Cómo puntuás"
      description={
        average !== null && rated !== null
          ? `Promedio ${average.toFixed(1).replace('.', ',')} ★ sobre ${formatNumber(
              rated,
            )} libros calificados`
          : undefined
      }
      tableCaption="Cantidad de libros por puntaje"
      keyHeader="Puntaje"
      rows={rows}
      footnote={
        unrated ? (
          <>
            {/* Link al buscador ya filtrado: si no, el número no se puede
                accionar (pedido de Camila: "¿cómo los encuentro?"). */}
            <Link
              href="/search?rating=0"
              className="font-semibold text-foreground underline underline-offset-2 rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {formatNumber(unrated)} {unrated === 1 ? 'libro está' : 'libros están'} sin
              calificar
            </Link>
            . No entran en el gráfico ni en el promedio: un 0 acá significa
            &quot;todavía no le puse estrellas&quot;, no &quot;me pareció
            malísimo&quot;. Tocá el número para verlos.
          </>
        ) : undefined
      }
    >
      <BarRowChart
        points={points}
        ariaLabel="Cantidad de libros por puntaje, de 5 a 1 estrellas"
        labelWidthClass="w-7 md:w-9"
        renderLabel={(point) => (
          <span className="inline-flex items-center gap-0.5">
            {point.label}
            <Star aria-hidden="true" className="h-3 w-3 fill-current" />
            <span className="sr-only">
              {point.label === '1' ? 'estrella' : 'estrellas'}
            </span>
          </span>
        )}
      />
    </ChartCard>
  )
}

/* ------------------------------------------------------------------ */
/* Cobertura parcial                                                   */
/* ------------------------------------------------------------------ */

function MissingDatesNote({ coverage }: { coverage: Coverage }) {
  const missing = coverage.total - coverage.included
  const pct = Math.round((missing / coverage.total) * 100)
  return (
    <>
      Este gráfico cuenta{' '}
      <strong className="font-semibold text-foreground">
        {formatNumber(coverage.included)} de tus {formatNumber(coverage.total)} libros
      </strong>
      : los otros {formatNumber(missing)} ({pct}%) están cargados sin fecha de fin,
      así que no hay manera de saber cuándo los terminaste.
    </>
  )
}

function CoverageNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
      <Info aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
