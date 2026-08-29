'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { SigovMark } from '@/components/shared/logo'
import { ServiceSwitcher } from './service-switcher'
import { SyncIndicator } from './sync-indicator'
import { useSession } from '@/lib/hooks/use-session'
import { NAV, APP } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/ui/primitives'
import { usePendingCounts } from '@/lib/hooks/use-pending-counts'

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  collapsed: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
}) {
  const pathname = usePathname()
  const { role, hasModule } = useSession()
  const counts = usePendingCounts()

  const items = NAV.filter(
    (n) => n.roles.includes(role) && (!n.module || hasModule(n.module))
  )

  const badgeFor = (key?: string) => {
    if (key === 'pci') return counts.pciCritical
    if (key === 'sync') return counts.pendingSync
    if (key === 'partes') return counts.partesPorValidar
    return 0
  }

  const content = (
    <>
      {/* Marca */}
      <div className={cn('flex h-16 shrink-0 items-center gap-2.5 px-4', collapsed && 'lg:justify-center lg:px-0')}>
        <SigovMark size={30} />
        {!collapsed && (
          <div className="min-w-0 lg:block">
            <div className="text-[17px] leading-none font-bold tracking-tight text-white">SIGOV</div>
            <div className="mt-1 truncate text-[9px] leading-none font-medium tracking-[0.14em] text-white/40 uppercase">
              Gestión Operativa Vial
            </div>
          </div>
        )}
        <button
          onClick={onMobileClose}
          className="ml-auto rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Cerrar menú"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Selector de servicio */}
      <div className={cn('px-3 pb-3', collapsed && 'lg:px-2')}>
        <ServiceSwitcher collapsed={collapsed} />
      </div>

      {/* Navegación */}
      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4" aria-label="Navegación principal">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            const badge = badgeFor(item.badge)
            const link = (
              <Link
                href={item.href}
                prefetch
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150',
                  active
                    ? 'bg-white/[0.13] text-white'
                    : 'text-white/62 hover:bg-white/[0.07] hover:text-white',
                  collapsed && 'lg:justify-center lg:px-0 lg:py-3'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="bg-accent absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <item.icon className={cn('size-[18px] shrink-0', active && 'text-accent')} />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {badge > 0 &&
                  (collapsed ? (
                    <span className="bg-destructive absolute top-1.5 right-2 size-2 rounded-full ring-2 ring-sidebar" />
                  ) : (
                    <span
                      className={cn(
                        'min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums',
                        item.badge === 'pci'
                          ? 'bg-destructive text-white'
                          : 'bg-accent text-accent-foreground'
                      )}
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  ))}
              </Link>
            )
            return (
              <li key={item.href}>
                {collapsed ? (
                  <Tip label={item.label} side="right">
                    {link}
                  </Tip>
                ) : (
                  link
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Pie: sincronización + colapsar */}
      <div className="mt-auto shrink-0 border-t border-sidebar-border px-3 py-3">
        <SyncIndicator collapsed={collapsed} />
        <button
          onClick={onToggle}
          className={cn(
            'mt-2 hidden w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/80 lg:flex',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && <span>Contraer</span>}
        </button>
        {!collapsed && (
          <div className="px-3 pt-2 text-[9.5px] tracking-wider text-white/25 uppercase">
            v{APP.version} · {APP.builtBy}
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* Escritorio */}
      <aside
        className={cn(
          'bg-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-sidebar-border transition-[width] duration-300 ease-out lg:flex',
          collapsed ? 'w-[72px]' : 'w-[264px]'
        )}
      >
        {content}
      </aside>

      {/* Móvil */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onMobileClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'bg-sidebar fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col transition-transform duration-300 ease-out lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {content}
      </aside>
    </>
  )
}
