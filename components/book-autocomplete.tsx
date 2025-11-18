'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

interface OpenLibraryBook {
  key: string
  title: string
  author_name?: string[]
  cover_i?: number
}

interface BookAutocompleteProps {
  value: string
  onValueChange: (value: string) => void
  onBookSelect: (book: { title: string; author: string; cover_url?: string }) => void
}

export function BookAutocomplete({ value, onValueChange, onBookSelect }: BookAutocompleteProps) {
  const [results, setResults] = useState<OpenLibraryBook[]>([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (value.length < 3) {
      setResults([])
      setShowResults(false)
      return
    }
    
    const timer = setTimeout(() => {
      searchBooks(value)
    }, 600)
    
    return () => clearTimeout(timer)
  }, [value])
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  async function searchBooks(searchQuery: string) {
    setLoading(true)
    try {
      const response = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(searchQuery)}&limit=8`
      )
      
      if (!response.ok) {
        throw new Error('Search failed')
      }
      
      const data = await response.json()
      setResults(data.docs || [])
      setShowResults(true)
    } catch (error) {
      console.error('Error searching books:', error)
      setResults([])
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
      author: book.author_name?.[0] || 'Autor Desconocido',
      cover_url: coverUrl,
    })
    
    setShowResults(false)
  }
  
  return (
    <div className="relative" ref={containerRef}>
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setShowResults(true)
        }}
        placeholder="Empieza a escribir el título..."
        required
      />
      
      {showResults && value.length >= 3 && (
        <Card className="absolute top-full left-0 right-0 mt-2 max-h-80 overflow-y-auto z-50 shadow-xl">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Buscando libros...</span>
            </div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-border">
              {results.map((book) => (
                <button
                  key={book.key}
                  type="button"
                  onClick={() => handleSelectBook(book)}
                  className="w-full p-3 flex gap-3 hover:bg-accent transition-colors text-left"
                >
                  {book.cover_i ? (
                    <img
                      src={`https://covers.openlibrary.org/b/id/${book.cover_i}-S.jpg`}
                      alt={book.title}
                      className="w-10 h-14 object-cover rounded shadow-sm flex-shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-14 bg-secondary rounded flex items-center justify-center flex-shrink-0">
                      <BookIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-snug line-clamp-2">
                      {book.title}
                    </p>
                    {book.author_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {book.author_name[0]}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No se encontraron resultados
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
