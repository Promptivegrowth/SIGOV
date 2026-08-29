'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Menu, Moon, Sun, Search, LogOut, User, Settings, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/primitives'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/select'
import { NotificationsBell } from './notifications-bell'
import { CommandPalette } from './command-palette'
import { useSession } from '@/lib/hooks/use-session'
import { NAV, ROLES } from '@/lib/constants'
import { cn, initials } from '@/lib/utils'
import { SigovMark } from '@/components/shared/logo'

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname()
  const { profile, role, signOut, service } = useSession()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  const [cmdOpen, setCmdOpen] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const current = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`))

  return (
    <>
      <header className="glass sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border px-4 lg:px-6">
        <Button variant="ghost" size="icon" onClick={onMenuClick} className="lg:hidden" aria-label="Abrir menú">
          <Menu className="size-5" />
        </Button>

        <div className="flex items-center gap-2.5 lg:hidden">
          <SigovMark size={26} />
        </div>

        <div className="hidden min-w-0 lg:block">
          <h1 className="truncate text-[15px] font-semibold tracking-tight">
            {current?.label ?? 'SIGOV'}
          </h1>
          <p className="text-muted-foreground truncate text-[11.5px]">
            {service.name}
            {service.client_name ? ` · ${service.client_name}` : ''}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setCmdOpen(true)}
            className={cn(
              'text-muted-foreground hover:text-foreground hover:border-primary/30 hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-[13px] transition-colors md:flex'
            )}
          >
            <Search className="size-3.5" />
            <span>Buscar…</span>
            <kbd className="bg-muted text-muted-foreground ml-2 rounded px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>

          <Button variant="ghost" size="icon" onClick={() => setCmdOpen(true)} className="md:hidden" aria-label="Buscar">
            <Search className="size-4.5" />
          </Button>

          <NotificationsBell />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Cambiar tema"
          >
            {mounted && theme === 'dark' ? <Sun className="size-4.5" /> : <Moon className="size-4.5" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hover:bg-secondary ml-0.5 flex items-center gap-2 rounded-lg p-1 pr-2 transition-colors">
                <Avatar className="size-8">
                  {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt={profile.full_name} />}
                  <AvatarFallback style={{ background: ROLES[role].color, color: 'white' }}>
                    {initials(profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-left lg:block">
                  <span className="block max-w-[130px] truncate text-[12.5px] font-medium leading-tight">
                    {profile.full_name}
                  </span>
                  <span className="text-muted-foreground block text-[10.5px] leading-tight">
                    {ROLES[role].label}
                  </span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>
                <div className="text-foreground text-[13px] font-semibold">{profile.full_name}</div>
                <div className="text-muted-foreground text-[11px] font-normal">{profile.email}</div>
                <div
                  className="mt-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                  style={{ background: ROLES[role].color }}
                >
                  {ROLES[role].label}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/perfil">
                  <User className="size-4" />
                  Mi perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/configuracion">
                  <Settings className="size-4" />
                  Configuración
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Apariencia</DropdownMenuLabel>
              <div className="grid grid-cols-3 gap-1 px-1 pb-1">
                {[
                  { v: 'light', icon: Sun, label: 'Claro' },
                  { v: 'dark', icon: Moon, label: 'Oscuro' },
                  { v: 'system', icon: Monitor, label: 'Auto' },
                ].map((t) => (
                  <button
                    key={t.v}
                    onClick={() => setTheme(t.v)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-md px-2 py-2 text-[10px] transition-colors',
                      mounted && theme === t.v ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60'
                    )}
                  >
                    <t.icon className="size-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
                <LogOut className="size-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </>
  )
}
