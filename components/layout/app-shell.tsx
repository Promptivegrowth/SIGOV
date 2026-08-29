'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'motion/react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { BottomNav } from './bottom-nav'
import { InstallPrompt } from './install-prompt'
import { OfflineBanner } from './offline-banner'
import { useSession } from '@/lib/hooks/use-session'
import { NAV } from '@/lib/constants'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { can, role, hasModule } = useSession()
  const [collapsed, setCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  // Preferencia de sidebar colapsado
  React.useEffect(() => {
    setCollapsed(localStorage.getItem('sigov.sidebar') === 'collapsed')
  }, [])

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((v) => {
      localStorage.setItem('sigov.sidebar', v ? 'expanded' : 'collapsed')
      return !v
    })
  }, [])

  React.useEffect(() => setMobileOpen(false), [pathname])

  // Guardia de acceso: un módulo apagado para el servicio activo — o un módulo
  // fuera del rol — no debe ser alcanzable escribiendo la URL a mano.
  React.useEffect(() => {
    const item = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))
    if (!item) return
    const blocked = (item.module && !hasModule(item.module)) || !item.roles.includes(role)
    if (blocked) router.replace('/dashboard')
  }, [pathname, hasModule, role, router])

  return (
    <div className={cn('bg-background min-h-dvh', can.field && 'field-mode')}>
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div
        className={cn(
          'flex min-h-dvh flex-col transition-[padding] duration-300 ease-out',
          collapsed ? 'lg:pl-[72px]' : 'lg:pl-[264px]'
        )}
      >
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <OfflineBanner />

        <main className="flex-1 pb-24 lg:pb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav />
      <InstallPrompt />
    </div>
  )
}
