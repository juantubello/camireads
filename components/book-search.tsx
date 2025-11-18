'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Search, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface OpenLibraryBook {
  key: string
  title: string
  author_name?: string[]
  cover_i?: number
}

interface BookSearchProps {
  onBookSelect: (book: { title: string; author: string; cover_url?: string }) => void
}

export function BookSearch({ onBookSelect }: BookSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OpenLibraryBook[]>([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  
  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }
    
    const timer = setTimeout(() => {
      searchBooks(query)
    }, 500)
    
    return () => clearTimeout(timer)
  }, [query])
  
  async function searchBooks(searchQuery: string) {
    setLoading(true)
    try {
      const response = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(searchQuery)}&limit=10`
      )
      const data = await response.json()
      setResults(data.docs || [])
      setShowResults(true)
    } catch (error) {
      console.error('[v0] Error searching books:', error)
    } finally {
      setLoading(false)
    }
  }
  
  function handleSelectBook(book: OpenLibraryBook) {
    const coverUrl = book.cover_i
      ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
      : undefined
    
    onBookSelect({
      title: book.title,
      author: book.author_name?.[0] || 'Unknown Author',
      cover_url: coverUrl,
    })
    
    setQuery('')
    setResults([])
    setShowResults(false)
  }
  
  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowResults(true)}
          placeholder="Buscar por título o autor..."
          className="pl-10"
        />
      </div>
      
      {showResults && query.length >= 2 && (
        <Card className="absolute top-full left-0 right-0 mt-2 max-h-96 overflow-y-auto z-50 shadow-lg">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-border">
              {results.map((book) => (
                <button
                  key={book.key}
                  type="button"
                  onClick={() => handleSelectBook(book)}
                  className="w-full p-4 flex gap-3 hover:bg-accent transition-colors text-left"
                >
                  {book.cover_i ? (
                    <img
                      src={`https://covers.openlibrary.org/b/id/${book.cover_i}-S.jpg`}
                      alt={book.title}
                      className="w-12 h-16 object-cover rounded shadow-sm flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-secondary rounded flex items-center justify-center flex-shrink-0">
                      <BookIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight line-clamp-2">
                      {book.title}
                    </p>
                    {book.author_name && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {book.author_name[0]}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No se encontraron libros
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}
