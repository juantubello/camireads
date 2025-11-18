/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker
  output: 'standalone',
  
  // Allow images from Open Library
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'covers.openlibrary.org',
      },
    ],
    unoptimized: true,
  },
  
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig
