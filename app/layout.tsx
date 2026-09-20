import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { AppNav } from '@/components/app-nav'

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: 'CamiReads - My Reading Journey',
  description: 'A personal reading tracker for book lovers',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

// En Next 16 `viewport` y `themeColor` ya no van dentro de `metadata`.
// `viewportFit: 'cover'` es lo que hace que `env(safe-area-inset-*)` devuelva
// valores reales en iPhone; sin eso siempre da 0.
// No se limita el zoom: bloquearlo es un antipatrón de accesibilidad.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F5F1ED',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${geist.className} font-sans antialiased`}>
        {children}
        <AppNav />
        <Analytics />
      </body>
    </html>
  )
}
