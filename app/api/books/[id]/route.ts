import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  // In production, this would fetch from your backend
  // const response = await fetch(`YOUR_BACKEND_URL/api/books/${id}`)
  // return NextResponse.json(await response.json())
  
  // Mock data
  const mockBook = {
    id: parseInt(id),
    title: 'The Midnight Library',
    author: 'Matt Haig',
    start_read_date: '2024-01-15',
    end_read_date: '2024-01-28',
    created_at: '2024-01-28T10:00:00Z',
    has_url_cover: true,
    url_cover: 'https://covers.openlibrary.org/b/id/10521270-M.jpg',
    review: {
      id: 1,
      book_id: parseInt(id),
      rating: 5,
      review_text: 'A beautiful exploration of life\'s infinite possibilities.',
      created_at: '2024-01-28T10:00:00Z',
    },
  }
  
  return NextResponse.json(mockBook)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  // In production, this would delete from your backend
  // await fetch(`YOUR_BACKEND_URL/api/books/${id}`, { method: 'DELETE' })
  
  return NextResponse.json({ success: true })
}
