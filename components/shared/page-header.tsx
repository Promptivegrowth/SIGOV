import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
  children,
}: {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn('border-b border-border', className)}>
      <div className="px-4 py-5 lg:px-6 lg:py-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            {Icon && (
              <span className="bg-primary/10 text-primary hidden size-11 shrink-0 items-center justify-center rounded-xl sm:flex">
                <Icon className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight lg:text-2xl">{title}</h1>
              {description && (
                <p className="text-muted-foreground mt-1 max-w-2xl text-[13px] leading-snug">
                  {description}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
        </div>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  )
}

export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('px-4 py-5 lg:px-6 lg:py-6', className)}>{children}</div>
}
