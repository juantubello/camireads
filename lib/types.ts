export interface Book {
  id: number
  title: string
  author: string
  start_read_date?: string
  end_read_date?: string
  created_at: string
  has_url_cover: boolean
  url_cover?: string
  b64_cover?: string
}

export interface Review {
  id: number
  book_id: number
  rating: number
  review_text?: string
  quotes?: string[]
  created_at: string
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  pageSize: number
  totalItems: number
  hasMore: boolean
}
