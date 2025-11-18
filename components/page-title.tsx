import { ReactNode } from 'react'

interface PageTitleProps {
  children: ReactNode
  subtitle?: string
  className?: string
}

export function PageTitle({ children, subtitle, className = '' }: PageTitleProps) {
  return (
    <header className={`mb-6 ${className}`}>
      <div className="relative inline-block">
        <h1 className="text-3xl font-serif font-bold text-foreground relative z-10">
          {children}
        </h1>
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-[#f3d6e0] dark:bg-pink-950/60 -z-0 translate-y-1 rounded-full" />
      </div>
      {subtitle && (
        <p className="text-muted-foreground mt-2">{subtitle}</p>
      )}
    </header>
  )
}
