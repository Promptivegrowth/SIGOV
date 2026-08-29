'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  User, Mail, Phone, IdCard, Briefcase, Building2, LogOut,
  Smartphone, Activity, CircleCheck, RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/primitives'
import { ROLES } from '@/lib/constants'
import { initials, fmtDate, fmtRelative, fmtNumber, cn } from '@/lib/utils'

export function PerfilClient() {
  const { profile, services, service, role, crew, signOut } = useSession()
  const sb = React.useMemo(() => createClient(), [])

  const activity = useQuery({
    queryKey: ['my-activity', profile.id],
    queryFn: async () => {
      const from = new Date(Date.now() - 30 * 86400000).toISOString()
      const [entries, evidences, syncs] = await Promise.all([
        sb.from('work_entries').select('id', { count: 'exact', head: true })
          .eq('created_by', profile.id).gte('created_at', from),
        sb.from('evidences').select('id', { count: 'exact', head: true })
          .eq('created_by', profile.id).gte('created_at', from),
        sb.from('sync_sessions').select('*').eq('profile_id', profile.id)
          .order('started_at', { ascending: false }).limit(5),
      ])
      return {
        registros: entries.count ?? 0,
        evidencias: evidences.count ?? 0,
        syncs: syncs.data ?? [],
      }
    },
  })

  const r = ROLES[role]

  return (
    <>
      <PageHeader icon={User} title="Mi perfil" description="Datos de tu cuenta, servicios asignados y actividad reciente." />

      <PageBody className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-5 p-6">
            <Avatar className="size-20">
              <AvatarFallback className="text-2xl" style={{ background: r.color, color: 'white' }}>
                {initials(profile.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold tracking-tight">{profile.full_name}</h2>
              <p className="text-muted-foreground text-[13px]">{profile.position ?? r.label}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge style={{ background: r.color, color: 'white' }}>{r.label}</Badge>
                {crew && <Badge variant="outline">{crew.name}</Badge>}
              </div>
            </div>
            <Button variant="outline" onClick={() => void signOut()}>
              <LogOut className="size-4" />
              Cerrar sesión
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <h3 className="text-[14px] font-semibold">Datos de contacto</h3>
              <dl className="mt-3.5 space-y-3">
                {[
                  { icon: Mail, k: 'Correo', v: profile.email },
                  { icon: Phone, k: 'Teléfono', v: profile.phone ?? '—' },
                  { icon: Briefcase, k: 'Cargo', v: profile.position ?? '—' },
                ].map((row) => (
                  <div key={row.k} className="flex items-start gap-3">
                    <span className="bg-secondary text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <row.icon className="size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-muted-foreground text-[11px]">{row.k}</dt>
                      <dd className="truncate text-[13px] font-medium">{row.v}</dd>
                    </div>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                <Building2 className="size-4" />
                Servicios asignados
              </h3>
              <ul className="mt-3.5 space-y-2">
                {services.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                      s.id === service.id ? 'border-primary/40 bg-primary/[0.04]' : 'border-border'
                    )}
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded text-[9.5px] font-bold text-white"
                      style={{ background: s.color }}
                    >
                      {s.code}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">{s.name}</span>
                      <span className="text-muted-foreground block text-[11px]">{ROLES[s.role].label}</span>
                    </span>
                    {s.id === service.id && <CircleCheck className="text-primary size-4 shrink-0" />}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-5">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                <Activity className="size-4" />
                Mi actividad (30 días)
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3.5">
                  <p className="text-2xl font-bold tabular-nums leading-none">
                    {fmtNumber(activity.data?.registros ?? 0)}
                  </p>
                  <p className="text-muted-foreground mt-1 text-[11.5px]">registros de campo</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3.5">
                  <p className="text-2xl font-bold tabular-nums leading-none">
                    {fmtNumber(activity.data?.evidencias ?? 0)}
                  </p>
                  <p className="text-muted-foreground mt-1 text-[11.5px]">evidencias capturadas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                <Smartphone className="size-4" />
                Sincronizaciones recientes
              </h3>
              {!activity.data?.syncs.length ? (
                <p className="text-muted-foreground mt-3 text-[12.5px]">Aún no hay sincronizaciones registradas.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {activity.data.syncs.map((s: any) => (
                    <li key={s.id} className="bg-muted/40 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[11.5px]">
                      <RefreshCw className="text-muted-foreground size-3 shrink-0" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">{s.device_id}</span>
                      <span className="text-muted-foreground shrink-0 tabular-nums">
                        ↑{s.pushed_count} ↓{s.pulled_count}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-[10.5px]">
                        {fmtRelative(s.started_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  )
}
