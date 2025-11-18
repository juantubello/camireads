import { NextResponse } from 'next/server'

// Mock data for development
const mockBooks = [
  {
    id: 1,
    title: 'The Midnight Library',
    author: 'Matt Haig',
    start_read_date: '2024-01-15',
    end_read_date: '2024-01-28',
    created_at: '2024-01-28T10:00:00Z',
    has_url_cover: true,
    url_cover: 'https://covers.openlibrary.org/b/id/10521270-M.jpg',
    review: {
      id: 1,
      book_id: 1,
      rating: 5,
      review_text: 'A beautiful exploration of life\'s infinite possibilities. The concept of the midnight library where you can explore different versions of your life is both haunting and hopeful. Matt Haig\'s writing is compassionate and thought-provoking.',
      created_at: '2024-01-28T10:00:00Z',
    },
  },
  {
    id: 2,
    title: 'Educated',
    author: 'Tara Westover',
    start_read_date: '2024-02-01',
    end_read_date: '2024-02-14',
    created_at: '2024-02-14T10:00:00Z',
    has_url_cover: true,
    url_cover: 'https://covers.openlibrary.org/b/id/8739161-M.jpg',
    review: {
      id: 2,
      book_id: 2,
      rating: 5,
      review_text: 'An incredibly powerful memoir about the transformative power of education. Tara\'s journey from a survivalist family in Idaho to Cambridge University is both inspiring and heartbreaking. A must-read.',
      created_at: '2024-02-14T10:00:00Z',
    },
  },
]

export async function GET() {
  // In production, this would fetch from your backend
  // const response = await fetch('YOUR_BACKEND_URL/api/books')
  // return NextResponse.json(await response.json())
  
  return NextResponse.json(mockBooks)
}

export async function POST(request: Request) {
  const body = await request.json()
  
  // In production, this would create a book in your backend
  // const response = await fetch('YOUR_BACKEND_URL/api/books', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(body),
  // })
  // return NextResponse.json(await response.json())
  
  const newBook = {
    id: Date.now(),
    ...body,
    created_at: new Date().toISOString(),
  }
  
  return NextResponse.json(newBook)
}
