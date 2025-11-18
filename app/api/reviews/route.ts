import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()
  
  // In production, this would create a review in your backend
  // const response = await fetch('YOUR_BACKEND_URL/api/reviews', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(body),
  // })
  // return NextResponse.json(await response.json())
  
  const newReview = {
    id: Date.now(),
    ...body,
    created_at: new Date().toISOString(),
  }
  
  return NextResponse.json(newReview)
}
