// stats.ts — métricas de lectura.
//
// Contrato real de `GET /stats`, verificado contra el sandbox (9096) el
// 2026-09-20:
//
//   {
//     totals: {books, reviews, quotes, distinctAuthors},
//     temporalCoverage: {withEndDate, withoutEndDate, coveragePercent},
//     ratings: {average, rated, unrated, distribution:[{rating, amount}]},
//     pages: {totalPages, booksMarkedRead, booksWithPageCount, averagePages, source},
//     booksPerYear: [{year, amount}],
//     booksPerMonthOfYear: [{month, amount}],
//     bestYear: {year, amount},
//     busiestMonthOfYear: {month, amount},
//     bestMonth: {year, month, amount},
//     topAuthor: {author, amount},
//     topQuotedBook: {bookId, title, author, amount},
//     yearToDate: {year, booksThisYear, previousYear, previousYearSameDate,
//                  previousYearTotal, difference, asOf},
//     generatedAt
//   }
//
// ⚠️ **Honestidad con los datos.** El propio endpoint dice cuántos libros entran
// en cada cálculo, y hay que usarlo: `temporalCoverage.withoutEndDate` son 799
// de 1944 libros (el 41%) sin fecha de fin, así que TODO lo temporal cubre 1145
// libros, no el total. Las páginas salen de `goodreads_import` y cubren 1011.
// Esos números van a la pantalla. Un número grande que miente es peor que no
// mostrarlo.
//
// El parseo es defensivo (campo que no viene => `null`, y la UI no dibuja esa
// tarjeta) pero NO inventa: nunca rellena un dato que el backend no mandó.

import { API_BASE_URL, getApiHeaders, readApiError } from '@/lib/api-config'

export interface CountPoint {
  /** Etiqueta del eje ("2023", "jun"). */
  label: string
  value: number
  /** Etiqueta larga para tooltips y lectores de pantalla. */
  fullLabel?: string
}

export interface Coverage {
  /** Cuántos libros entran en el cálculo. */
  included: number
  /** Sobre cuántos en total. */
  total: number
}

export interface Stats {
  totals: {
    books: number | null
    reviews: number | null
    authors: number | null
    quotes: number | null
  }
  /** Cobertura de todo lo temporal (los libros con fecha de fin). */
  datedCoverage: Coverage | null
  pages: {
    total: number | null
    average: number | null
    /** Cobertura del dato de páginas (viene de Goodreads). */
    coverage: Coverage | null
    source: string | null
  }
  byYear: CountPoint[]
  byMonth: CountPoint[]
  ratings: {
    /** De 1 a 5 estrellas. El 0 ("sin calificar") va aparte, en `unrated`. */
    distribution: Array<{ rating: number; count: number }>
    average: number | null
    rated: number | null
    unrated: number | null
  }
  bestMonth: { year: number; month: number; count: number } | null
  topAuthor: { name: string; count: number } | null
  mostQuotedBook: {
    id: number | null
    title: string
    author: string | null
    quotes: number
  } | null
  yearToDate: {
    year: number
    booksThisYear: number
    previousYear: number
    previousYearSameDate: number
    previousYearTotal: number | null
    /** Fecha del corte, tal como la manda el backend ("2026-09-20"). */
    asOf: string | null
  } | null
}

export const MONTH_LABELS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]

export const MONTH_FULL = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/* ------------------------------------------------------------------ */
/* Lectura defensiva                                                   */
/* ------------------------------------------------------------------ */

type Raw = Record<string, unknown>

function obj(value: unknown): Raw | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Raw)
    : null
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/* ------------------------------------------------------------------ */
/* Normalización                                                       */
/* ------------------------------------------------------------------ */

export function normalizeStats(raw: unknown): Stats {
  const root = obj(raw) ?? {}

  // ---- totales
  const totalsNode = obj(root.totals) ?? {}
  const books = num(totalsNode.books)
  const totals = {
    books,
    reviews: num(totalsNode.reviews),
    authors: num(totalsNode.distinctAuthors),
    quotes: num(totalsNode.quotes),
  }

  // ---- cobertura temporal
  const coverageNode = obj(root.temporalCoverage)
  const withEndDate = coverageNode ? num(coverageNode.withEndDate) : null
  const withoutEndDate = coverageNode ? num(coverageNode.withoutEndDate) : null
  const datedCoverage: Coverage | null =
    withEndDate !== null
      ? {
          included: withEndDate,
          // Preferimos el total que se deduce de la propia cobertura: es
          // internamente consistente con el gráfico aunque `totals.books`
          // cambie por otro motivo.
          total: withoutEndDate !== null ? withEndDate + withoutEndDate : (books ?? withEndDate),
        }
      : null

  // ---- páginas
  const pagesNode = obj(root.pages) ?? {}
  const booksWithPageCount = num(pagesNode.booksWithPageCount)
  const pages = {
    total: num(pagesNode.totalPages),
    average: num(pagesNode.averagePages),
    coverage:
      booksWithPageCount !== null && books !== null
        ? { included: booksWithPageCount, total: books }
        : null,
    source: str(pagesNode.source),
  }

  // ---- series
  const byYear: CountPoint[] = (Array.isArray(root.booksPerYear) ? root.booksPerYear : [])
    .map((item) => {
      const node = obj(item)
      const year = node ? num(node.year) : null
      const amount = node ? num(node.amount) : null
      return year !== null && amount !== null ? { year, amount } : null
    })
    .filter((x): x is { year: number; amount: number } => x !== null)
    .sort((a, b) => a.year - b.year)
    .map(({ year, amount }) => ({
      label: String(year),
      value: amount,
      fullLabel: `${amount} ${plural(amount, 'libro', 'libros')} en ${year}`,
    }))

  const byMonth: CountPoint[] = (
    Array.isArray(root.booksPerMonthOfYear) ? root.booksPerMonthOfYear : []
  )
    .map((item) => {
      const node = obj(item)
      const month = node ? num(node.month) : null
      const amount = node ? num(node.amount) : null
      return month !== null && amount !== null && month >= 1 && month <= 12
        ? { month, amount }
        : null
    })
    .filter((x): x is { month: number; amount: number } => x !== null)
    .sort((a, b) => a.month - b.month)
    .map(({ month, amount }) => ({
      label: MONTH_LABELS[month - 1],
      value: amount,
      fullLabel: `${amount} ${plural(amount, 'libro', 'libros')} en ${MONTH_FULL[month - 1]}`,
    }))

  // ---- ratings
  const ratingsNode = obj(root.ratings) ?? {}
  const distribution = (
    Array.isArray(ratingsNode.distribution) ? ratingsNode.distribution : []
  )
    .map((item) => {
      const node = obj(item)
      const rating = node ? num(node.rating) : null
      const amount = node ? num(node.amount) : null
      return rating !== null && amount !== null ? { rating, count: amount } : null
    })
    .filter((x): x is { rating: number; count: number } => x !== null)
    // El 0 no es un puntaje bajo: es "todavía no le puse estrellas" (702
    // reseñas). Sale de la distribución y se cuenta aparte, en `unrated`.
    .filter((x) => x.rating >= 1 && x.rating <= 5)
    .sort((a, b) => b.rating - a.rating)

  const unratedFromDistribution = (
    Array.isArray(ratingsNode.distribution) ? ratingsNode.distribution : []
  ).reduce<number | null>((acc, item) => {
    const node = obj(item)
    if (node && num(node.rating) === 0) return num(node.amount)
    return acc
  }, null)

  // ---- destacados
  const bestMonthNode = obj(root.bestMonth)
  const bestMonthYear = bestMonthNode ? num(bestMonthNode.year) : null
  const bestMonthMonth = bestMonthNode ? num(bestMonthNode.month) : null
  const bestMonthAmount = bestMonthNode ? num(bestMonthNode.amount) : null

  const topAuthorNode = obj(root.topAuthor)
  const topAuthorName = topAuthorNode ? str(topAuthorNode.author) : null
  const topAuthorCount = topAuthorNode ? num(topAuthorNode.amount) : null

  const quotedNode = obj(root.topQuotedBook)
  // Ojo: algunos títulos de la importación de Goodreads arrancan con un
  // espacio (" The Games Gods Play…"). `str()` ya lo recorta.
  const quotedTitle = quotedNode ? str(quotedNode.title) : null
  const quotedCount = quotedNode ? num(quotedNode.amount) : null

  // ---- año contra año
  const ytdNode = obj(root.yearToDate)
  const ytdYear = ytdNode ? num(ytdNode.year) : null
  const ytdThis = ytdNode ? num(ytdNode.booksThisYear) : null
  const ytdPrevYear = ytdNode ? num(ytdNode.previousYear) : null
  const ytdPrevSame = ytdNode ? num(ytdNode.previousYearSameDate) : null

  return {
    totals,
    datedCoverage,
    pages,
    byYear,
    byMonth,
    ratings: {
      distribution,
      average: num(ratingsNode.average),
      rated: num(ratingsNode.rated),
      unrated: num(ratingsNode.unrated) ?? unratedFromDistribution,
    },
    bestMonth:
      bestMonthYear !== null && bestMonthMonth !== null && bestMonthAmount !== null
        ? { year: bestMonthYear, month: bestMonthMonth, count: bestMonthAmount }
        : null,
    topAuthor:
      topAuthorName !== null && topAuthorCount !== null
        ? { name: topAuthorName, count: topAuthorCount }
        : null,
    mostQuotedBook:
      quotedTitle !== null && quotedCount !== null
        ? {
            id: quotedNode ? num(quotedNode.bookId) : null,
            title: quotedTitle,
            author: quotedNode ? str(quotedNode.author) : null,
            quotes: quotedCount,
          }
        : null,
    yearToDate:
      ytdYear !== null && ytdThis !== null && ytdPrevYear !== null && ytdPrevSame !== null
        ? {
            year: ytdYear,
            booksThisYear: ytdThis,
            previousYear: ytdPrevYear,
            previousYearSameDate: ytdPrevSame,
            previousYearTotal: ytdNode ? num(ytdNode.previousYearTotal) : null,
            asOf: ytdNode ? str(ytdNode.asOf) : null,
          }
        : null,
  }
}

export async function fetchStats(signal?: AbortSignal): Promise<Stats> {
  const baseUrl = await API_BASE_URL
  const response = await fetch(`${baseUrl}/stats`, {
    headers: getApiHeaders(),
    signal,
  })

  if (!response.ok) {
    throw new Error(await readApiError(response, 'No pude traer tus métricas.'))
  }

  return normalizeStats(await response.json())
}

/** 371989 -> "371.989" (separador de miles del castellano). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-AR').format(Math.round(value))
}

/** "2026-09-20" -> "20 de septiembre". Si no parsea, devuelve null. */
export function formatAsOf(asOf: string | null): string | null {
  if (!asOf) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf)
  if (!match) return null
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return null
  return `${day} de ${MONTH_FULL[month - 1]}`
}
