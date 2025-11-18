// API configuration for CamiReads frontend
// Use environment variable for backend URL in production
export const API_BASE_URL = 
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
