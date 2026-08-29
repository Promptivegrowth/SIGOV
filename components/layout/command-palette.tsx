'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import {
  Search, CornerDownLeft, TriangleAlert, Boxes, MapPin, ListChecks,
  Truck, Users, FolderOpen, Loader2,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { NAV, SEMAFORO, ROLES, type Semaforo, type Role } from '@/lib/constants'
import { cn, truncate, fmtDate } from '@/lib/utils'

/**
 * Buscador global (⌘K).
 * Una sola llamada a la función `buscar` recorre PCIs, inventario, actividades,
 * cuadrillas, personas y documentos con índices trigram, de modo que responde
 * igual de rápido con 300 ítems que con 30 000.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const { role, hasModule, service } = useSession()
  const [query, setQuery] = React.useState('')
  const [debounced, setDebounced] = React.useState('')

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220)
    return () => clearTimeout(t)
  }, [query])

  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const { data, isFetching } = useQuery({
    queryKey: ['buscar', service.id, debounced],
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const sb = createClient()
      const { data, error } = await sb.rpc('buscar', {
        p_service_id: service.id,
        p_q: debounced,
        p_limit: 6,
      })
      if (error) throw error
      return data as any
    },
  })

  const go = (href: string) => {
    onOpenChange(false)
    setQuery('')
    router.push(href)
  }

  const navItems = NAV.filter((n) => n.roles.includes(role) && (!n.module || hasModule(n.module)))
  const filteredNav = navItems.filter(
    (n) => !query || n.label.toLowerCase().includes(query.toLowerCase())
  )

  type Rendered = { href: string; title: string; subtitle: string; badge?: React.ReactNode }
  const groups: {
    key: string; heading: string; icon: any; show: boolean
    rows: any[]; render: (r: any) => Rendered
  }[] = [
    {
      key: 'pci',
      heading: 'Ítems de PCI',
      icon: TriangleAlert,
      show: hasModule('pci'),
      rows: data?.pci ?? [],
      render: (r: any) => ({
        href: `/pci/${r.pci_id}`,
        title: `${r.pci_code} · ítem ${r.item_number}`,
        subtitle: truncate(r.description, 70),
        badge: <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--sem-${r.semaforo})` }} />,
      }),
    },
    {
      key: 'inventario',
      heading: 'Inventario vial',
      icon: Boxes,
      show: hasModule('inventario'),
      rows: data?.inventario ?? [],
      render: (r: any) => ({
        href: `/inventario?focus=${r.id}`,
        title: `${r.code} · ${r.type_name}`,
        subtitle: `${r.section_name ?? '—'} · ${r.progresiva ?? '—'}`,
      }),
    },
    {
      key: 'actividades',
      heading: 'Catálogo de actividades',
      icon: ListChecks,
      show: true,
      rows: data?.actividades ?? [],
      render: (r: any) => ({
        href: '/configuracion',
        title: `${r.code} · ${r.name}`,
        subtitle: r.category,
        badge: <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />,
      }),
    },
    {
      key: 'cuadrillas',
      heading: 'Cuadrillas',
      icon: Truck,
      show: true,
      rows: data?.cuadrillas ?? [],
      render: (r: any) => ({
        href: '/configuracion',
        title: r.name,
        subtitle: r.code,
        badge: <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />,
      }),
    },
    {
      key: 'personas',
      heading: 'Personas',
      icon: Users,
      show: ['admin', 'supervisor'].includes(role),
      rows: data?.personas ?? [],
      render: (r: any) => ({
        href: '/configuracion',
        title: r.full_name,
        subtitle: `${ROLES[r.role as Role]?.label ?? r.role} · ${r.email}`,
      }),
    },
    {
      key: 'documentos',
      heading: 'Archivo documental',
      icon: FolderOpen,
      show: true,
      rows: data?.documentos ?? [],
      render: (r: any) => ({
        href: '/archivo',
        title: r.title,
        subtitle: `${r.file_name}${r.doc_date ? ` · ${fmtDate(r.doc_date)}` : ''}`,
      }),
    },
  ].filter((g) => g.show && g.rows.length > 0)

  const hasResults = filteredNav.length > 0 || groups.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="max-w-2xl gap-0 overflow-hidden p-0" size="lg">
        <Command shouldFilter={false}>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar PCIs, inventario, actividades, personas, documentos…"
              className="placeholder:text-muted-foreground/70 h-12 w-full bg-transparent text-sm outline-none"
              autoFocus
            />
            {isFetching && <Loader2 className="text-muted-foreground size-3.5 animate-spin" />}
            <kbd className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">ESC</kbd>
          </div>

          <Command.List className="max-h-[62vh] overflow-y-auto p-2">
            {!hasResults && (
              <Command.Empty className="text-muted-foreground py-10 text-center text-sm">
                {debounced.length >= 2
                  ? `Sin resultados para "${debounced}".`
                  : 'Escribe al menos 2 caracteres para buscar en todo el servicio.'}
              </Command.Empty>
            )}

            {filteredNav.length > 0 && (
              <Group heading="Ir a">
                {filteredNav.map((n) => (
                  <Item key={n.href} onSelect={() => go(n.href)}>
                    <n.icon className="text-muted-foreground size-4 shrink-0" />
                    <span className="flex-1">{n.label}</span>
                    <CornerDownLeft className="text-muted-foreground/50 size-3" />
                  </Item>
                ))}
              </Group>
            )}

            {groups.map((g) => (
              <Group key={g.key} heading={g.heading}>
                {g.rows.map((r: any) => {
                  const v = g.render(r)
                  return (
                    <Item key={`${g.key}-${r.id}`} onSelect={() => go(v.href)}>
                      <g.icon className="text-muted-foreground size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{v.title}</span>
                        <span className="text-muted-foreground block truncate text-[11px]">{v.subtitle}</span>
                      </span>
                      {v.badge}
                    </Item>
                  )
                })}
              </Group>
            ))}
          </Command.List>

          <div className="text-muted-foreground flex items-center justify-between border-t border-border px-4 py-2 text-[10.5px]">
            <span>Busca en todo el servicio activo</span>
            <span className="flex items-center gap-2">
              <kbd className="bg-muted rounded px-1 py-0.5 font-mono">↑↓</kbd> navegar
              <kbd className="bg-muted rounded px-1 py-0.5 font-mono">↵</kbd> abrir
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium"
    >
      {children}
    </Command.Group>
  )
}

function Item({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="data-[selected=true]:bg-secondary flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors"
    >
      {children}
    </Command.Item>
  )
}
