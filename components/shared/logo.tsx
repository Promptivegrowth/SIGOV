import { cn } from '@/lib/utils'

/**
 * Marca SIGOV — una vía en perspectiva dentro de un escudo redondeado.
 * La calzada converge hacia el horizonte y las marcas centrales son ámbar
 * de señalización. Legible desde 16 px.
 */
export function SigovMark({
  className,
  size = 32,
  mono = false,
}: {
  className?: string
  size?: number
  mono?: boolean
}) {
  const id = mono ? 'sigov-mono' : 'sigov'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-label="SIGOV"
      role="img"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor={mono ? 'currentColor' : '#2B4FD6'} />
          <stop offset="0.55" stopColor={mono ? 'currentColor' : '#1B31A0'} />
          <stop offset="1" stopColor={mono ? 'currentColor' : '#101C5E'} />
        </linearGradient>
        <linearGradient id={`${id}-road`} x1="24" y1="12" x2="24" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.42" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.96" />
        </linearGradient>
      </defs>

      {/* Escudo */}
      <path
        d="M24 2.5 6.5 8.4v15.9c0 9.9 7 19 17.5 21.2 10.5-2.2 17.5-11.3 17.5-21.2V8.4L24 2.5Z"
        fill={`url(#${id}-bg)`}
      />

      {/* Calzada en perspectiva */}
      <path d="M19.7 13.5h8.6l6 26.2c-2.6 1.9-6.1 3.4-10.3 4.4-4.2-1-7.7-2.5-10.3-4.4l6-26.2Z" fill={`url(#${id}-road)`} />

      {/* Marcas centrales ámbar */}
      <g fill="#F5A314">
        <rect x="22.85" y="15.4" width="2.3" height="4.1" rx="1.15" />
        <rect x="22.8" y="22.1" width="2.4" height="4.8" rx="1.2" />
        <rect x="22.72" y="29.7" width="2.56" height="5.6" rx="1.28" />
      </g>

      {/* Horizonte */}
      <rect x="17.4" y="11.6" width="13.2" height="2.1" rx="1.05" fill="#F5A314" opacity="0.92" />
    </svg>
  )
}

export function SigovLogo({
  className,
  size = 32,
  showTagline = false,
  inverted = false,
}: {
  className?: string
  size?: number
  showTagline?: boolean
  inverted?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <SigovMark size={size} />
      <div className="leading-none">
        <div
          className={cn(
            'font-bold tracking-tight',
            inverted ? 'text-white' : 'text-foreground'
          )}
          style={{ fontSize: size * 0.58, letterSpacing: '-0.02em' }}
        >
          SIGOV
        </div>
        {showTagline && (
          <div
            className={cn('mt-1 font-medium tracking-wide uppercase', inverted ? 'text-white/55' : 'text-muted-foreground')}
            style={{ fontSize: Math.max(8, size * 0.24) }}
          >
            Gestión Operativa Vial
          </div>
        )}
      </div>
    </div>
  )
}
