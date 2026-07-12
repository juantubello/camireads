export type KindleNotebookImportResult = {
  title: string
  author: string
  quotes: string[]
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function uniquePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>()

  return values.filter((value) => {
    const key = value.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function mergeQuotes(existingQuotes: string[], importedQuotes: string[]): string[] {
  return uniquePreservingOrder([
    ...existingQuotes.map((quote) => quote.trim()).filter(Boolean),
    ...importedQuotes.map((quote) => quote.trim()).filter(Boolean),
  ])
}

export function parseKindleNotebookHtml(html: string): KindleNotebookImportResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const title = normalizeText(doc.querySelector('.bookTitle')?.textContent ?? '')
  const author = normalizeText(doc.querySelector('.authors')?.textContent ?? '')
  const quotes: string[] = []
  const headings = Array.from(doc.querySelectorAll('.noteHeading'))

  for (const heading of headings) {
    const headingText = normalizeText(heading.textContent ?? '')
    if (!headingText.startsWith('Subrayar')) continue

    const noteText = heading.nextElementSibling
    if (!noteText?.classList.contains('noteText')) continue

    const quote = normalizeText(noteText.textContent ?? '')
    if (quote) quotes.push(quote)
  }

  return {
    title,
    author,
    quotes: uniquePreservingOrder(quotes),
  }
}
