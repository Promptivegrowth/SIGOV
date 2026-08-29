'use client'

import { Check, ChevronsUpDown, Building2 } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/select'
import { useSession } from '@/lib/hooks/use-session'
import { ROLES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/ui/primitives'

export function ServiceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { services, service, switchService, role } = useSession()

  const trigger = (
    <button
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.05] p-2.5 text-left transition-colors hover:bg-white/[0.09]',
        collapsed && 'lg:justify-center lg:p-2'
      )}
    >
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
        style={{ background: service.color }}
      >
        {service.code}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold leading-tight text-white">
              {service.name}
            </span>
            <span className="block truncate text-[10.5px] leading-tight text-white/45">
              {ROLES[role].label}
              {service.contract_code ? ` · ${service.contract_code}` : ''}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-white/40 transition-colors group-hover:text-white/70" />
        </>
      )}
    </button>
  )

  if (services.length <= 1) {
    return collapsed ? <Tip label={service.name} side="right">{trigger}</Tip> : trigger
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? <Tip label={service.name} side="right">{trigger}</Tip> : trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72" sideOffset={8}>
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Building2 className="size-3" />
          Servicios / contratos
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {services.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => switchService(s.id)}
            className="items-start gap-2.5 py-2.5"
          >
            <span
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white"
              style={{ background: s.color }}
            >
              {s.code}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-tight">{s.name}</span>
              <span className="text-muted-foreground block truncate text-[11px] leading-tight">
                {ROLES[s.role].label}
                {s.client_name ? ` · ${s.client_name}` : ''}
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                {Object.entries(s.modules)
                  .filter(([, v]) => v)
                  .slice(0, 4)
                  .map(([k]) => (
                    <span key={k} className="bg-secondary text-secondary-foreground rounded px-1 py-px text-[9px] capitalize">
                      {k}
                    </span>
                  ))}
              </span>
            </span>
            {s.id === service.id && <Check className="text-primary mt-0.5 size-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div className="text-muted-foreground px-2 py-1.5 text-[10.5px] leading-snug">
          Cada servicio mantiene su información completamente separada.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
