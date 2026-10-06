import { formatRating, isRated } from '@/lib/rating'

type ReviewForAiInput = {
  title: string
  author: string
  rating?: number
  reviewText?: string
  quotes?: string[]
}

export function stripReviewHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function buildReviewTextForAi({
  title,
  author,
  rating,
  reviewText,
  quotes = [],
}: ReviewForAiInput): string {
  const sections = [
    `Titulo: ${title}`,
    `Autor: ${author}`,
  ]

  if (isRated(rating)) {
    // Mismo formato que en la app: "3.75/5", "4.00/5".
    sections.push(`Calificacion: ${formatRating(rating)}/5`)
  }

  const cleanReview = stripReviewHtml(reviewText ?? '')
  if (cleanReview) {
    sections.push(`Resena:\n${cleanReview}`)
  }

  const cleanQuotes = quotes.map((quote) => quote.trim()).filter(Boolean)
  if (cleanQuotes.length > 0) {
    sections.push(`Frases:\n${cleanQuotes.map((quote) => `- ${quote}`).join('\n\n')}`)
  }

  return sections.join('\n\n')
}
