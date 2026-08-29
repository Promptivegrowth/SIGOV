'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { useQuery } from '@tanstack/react-query'
import { Search, CornerDownLeft, TriangleAlert, Boxes, MapPin } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { NAV, SEMAFORO, type Semaforo } from '@/lib/constants'
import { cn, fmtProgresiva, truncate } from '@/lib/utils'

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
    const t = setTimeout(() => setDebounced(query), 220)
    return () => clearTimeout(t)
  }, [query])

  const { data: results, isFetching } = useQuery({
    queryKey: ['cmd-search', service.id, debounced],
    enabled: open && debounced.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const sb = createClient()
      const q = debounced.trim()
      const [pci, assets] = await Promise.all([
        sb
          .from('v_pci_items')
          .select('id, pci_id, item_number, description, pci_code, semaforo, section_name, prog_start_m')
          .eq('service_id', service.id)
          .ilike('description', `%${q}%`)
          .limit(6),
        sb
          .from('v_road_assets')
          .select('id, code, name, type_name, section_name, progresiva_m, condition')
          .eq('service_id', service.id)
          .or(`code.ilike.%${q}%,name.ilike.%${q}%`)
          .limit(6),
      ])
      return { pci: pci.data ?? [], assets: assets.data ?? [] }
    },
  })

  const go = (href: string) => {
    onOpenChange(false)
    setQuery('')
    router.push(href)
  }

  const navItems = NAV.filter((n) => n.roles.includes(role) && (!n.module || hasModule(n.module)))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} className="max-w-2xl gap-0 overflow-hidden p-0" size="lg">
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:text-muted-foreground">
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar módulos, PCIs, elementos del inventario…"
              className="placeholder:text-muted-foreground/70 h-12 w-full bg-transparent text-sm outline-none"
              autoFocus
            />
            {isFetching && <span className="text-muted-foreground text-[10px]">buscando…</span>}
            <kbd className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">ESC</kbd>
          </div>

          <Command.List className="max-h-[62vh] overflow-y-auto p-2">
            <Command.Empty className="text-muted-foreground py-10 text-center text-sm">
              {debounced.length >= 2 ? 'Sin resultados.' : 'Escribe al menos 2 caracteres.'}
            </Command.Empty>

            <Command.Group heading="Navegación" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium">
              {navItems
                .filter((n) => !query || n.label.toLowerCase().includes(query.toLowerCase()))
                .map((n) => (
                  <Item key={n.href} onSelect={() => go(n.href)}>
                    <n.icon className="text-muted-foreground size-4" />
                    <span className="flex-1">{n.label}</span>
                    <CornerDownLeft className="text-muted-foreground/50 size-3" />
                  </Item>
                ))}
            </Command.Group>

            {!!results?.pci.length && (
              <Command.Group heading="Ítems de PCI" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium">
                {results.pci.map((p: any) => (
                  <Item key={p.id} onSelect={() => go(`/pci/${p.pci_id}?item=${p.id}`)}>
                    <TriangleAlert className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">
                        {p.pci_code} · ítem {p.item_number}
                      </span>
                      <span className="text-muted-foreground block truncate text-[11px]">
                        {truncate(p.description, 70)}
                      </span>
                    </span>
                    <span
                      className={cn('size-2 shrink-0 rounded-full', SEMAFORO[p.semaforo as Semaforo]?.className)}
                    />
                  </Item>
                ))}
              </Command.Group>
            )}

            {!!results?.assets.length && (
              <Command.Group heading="Inventario vial" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium">
                {results.assets.map((a: any) => (
                  <Item key={a.id} onSelect={() => go(`/inventario?focus=${a.id}`)}>
                    <Boxes className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{a.code} · {a.type_name}</span>
                      <span className="text-muted-foreground flex items-center gap-1 truncate text-[11px]">
                        <MapPin className="size-2.5" />
                        {a.section_name} · {fmtProgresiva(a.progresiva_m)}
                      </span>
                    </span>
                  </Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
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
