'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { useSession } from '@/lib/hooks/use-session'
import { usePendingCounts } from '@/lib/hooks/use-pending-counts'
import { NAV, type NavItem } from '@/lib/constants'
import { LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Barra inferior del MODO CAMPO.
 * Objetivos táctiles de 56 px: se usa con guantes, de pie, bajo el sol.
 */
export function BottomNav() {
  const pathname = usePathname()
  const { role, hasModule } = useSession()
  const counts = usePendingCounts()

  const dashboard: NavItem = {
    href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: [], field: true,
  }

  const items = [
    dashboard,
    ...NAV.filter((n) => n.field && n.roles.includes(role) && (!n.module || hasModule(n.module))),
  ].slice(0, 5)

  const badgeFor = (key?: string) =>
    key === 'pci' ? counts.pciCritical : key === 'sync' ? counts.pendingSync : 0

  return (
    <nav
      className="glass safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border lg:hidden"
      aria-label="Navegación de campo"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const badge = badgeFor(item.badge)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                prefetch
                className={cn(
                  'relative flex h-16 flex-col items-center justify-center gap-1 transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-active"
                    className="bg-primary absolute top-0 h-[2.5px] w-10 rounded-b-full"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">
                  <item.icon className={cn('size-[22px]', active && 'stroke-[2.3]')} />
                  {badge > 0 && (
                    <span className="bg-destructive absolute -top-1 -right-2 flex min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className="text-[10.5px] font-medium leading-none">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
