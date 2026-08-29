'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Settings, Users, Route, ListChecks, Truck, Building2, ShieldCheck,
  Database, HardDrive, Bell, CircleCheck, CircleX, Activity, Ruler,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent, Switch, Avatar, AvatarFallback } from '@/components/ui/primitives'
import { SkeletonTable } from '@/components/ui/skeleton'
import { Progresiva, EmptyState } from '@/components/shared/misc'
import { ROLES, ASSET_CONDITION } from '@/lib/constants'
import { cn, fmtDate, fmtNumber, fmtRelative, initials, bytes } from '@/lib/utils'
import { storageEstimate } from '@/lib/offline/db'
import { pushSupported, pushPermission, enablePush, isStandalone, isIOS } from '@/lib/push'
import { toast } from 'sonner'

export function ConfiguracionClient() {
  const { service, services, can, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [tab, setTab] = React.useState('usuarios')

  const members = useQuery({
    queryKey: ['members', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('service_members')
        .select('id, role, created_at, profiles(id, full_name, email, position, phone, is_active, last_seen_at)')
        .eq('service_id', service.id)
      return data ?? []
    },
  })

  const sections = useQuery({
    queryKey: ['sections-config', service.id],
    enabled: tab === 'tramos',
    queryFn: async () => {
      const { data } = await sb
        .from('road_sections')
        .select('*')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .order('prog_start_m')
      return data ?? []
    },
  })

  const activities = useQuery({
    queryKey: ['activities-config', service.id],
    enabled: tab === 'actividades',
    queryFn: async () => {
      const { data } = await sb
        .from('activities_catalog')
        .select('*, units(symbol, name)')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .order('code')
      return data ?? []
    },
  })

  const crews = useQuery({
    queryKey: ['crews-config', service.id],
    enabled: tab === 'cuadrillas',
    queryFn: async () => {
      const { data } = await sb
        .from('crews')
        .select('*, crew_members(id, full_name, dni, position, is_active), profiles:leader_id(full_name)')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .order('code')
      return data ?? []
    },
  })

  const audit = useQuery({
    queryKey: ['audit', service.id],
    enabled: tab === 'seguridad',
    queryFn: async () => {
      const { data } = await sb
        .from('audit_log')
        .select('id, table_name, action, actor_email, created_at, record_id')
        .eq('service_id', service.id)
        .order('created_at', { ascending: false })
        .limit(60)
      return data ?? []
    },
  })

  return (
    <>
      <PageHeader
        icon={Settings}
        title="Configuración"
        description="Usuarios y roles, catálogo de actividades, tramos y progresivas, cuadrillas, módulos por servicio y trazabilidad del sistema."
      />

      <PageBody>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="usuarios"><Users className="size-3.5" />Usuarios</TabsTrigger>
            <TabsTrigger value="servicios"><Building2 className="size-3.5" />Servicios</TabsTrigger>
            <TabsTrigger value="tramos"><Route className="size-3.5" />Tramos</TabsTrigger>
            <TabsTrigger value="actividades"><ListChecks className="size-3.5" />Actividades</TabsTrigger>
            <TabsTrigger value="cuadrillas"><Truck className="size-3.5" />Cuadrillas</TabsTrigger>
            <TabsTrigger value="dispositivo"><HardDrive className="size-3.5" />Dispositivo</TabsTrigger>
            {can.manage && <TabsTrigger value="seguridad"><ShieldCheck className="size-3.5" />Seguridad</TabsTrigger>}
          </TabsList>

          {/* ── Usuarios ───────────────────────────────────────────────── */}
          <TabsContent value="usuarios" className="mt-4">
            {members.isLoading ? (
              <SkeletonTable rows={6} cols={5} />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-muted/40 text-muted-foreground text-[11px] tracking-wide uppercase">
                      <tr>
                        {['Usuario', 'Rol en el servicio', 'Cargo', 'Contacto', 'Estado', 'Última actividad'].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {members.data?.map((m: any) => {
                        const p = m.profiles
                        const role = ROLES[m.role as keyof typeof ROLES]
                        return (
                          <tr key={m.id} className="hover:bg-secondary/40">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar className="size-8">
                                  <AvatarFallback style={{ background: role.color, color: 'white' }}>
                                    {initials(p?.full_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{p?.full_name}</p>
                                  <p className="text-muted-foreground truncate text-[11px]">{p?.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" style={{ color: role.color, borderColor: role.color }}>
                                {role.label}
                              </Badge>
                            </td>
                            <td className="text-muted-foreground px-4 py-3">{p?.position ?? '—'}</td>
                            <td className="text-muted-foreground px-4 py-3 tabular-nums">{p?.phone ?? '—'}</td>
                            <td className="px-4 py-3">
                              {p?.is_active ? (
                                <span className="text-success flex items-center gap-1 text-[11.5px] font-medium">
                                  <CircleCheck className="size-3" />Activo
                                </span>
                              ) : (
                                <span className="text-muted-foreground flex items-center gap-1 text-[11.5px]">
                                  <CircleX className="size-3" />Inactivo
                                </span>
                              )}
                            </td>
                            <td className="text-muted-foreground px-4 py-3 text-[11.5px]">
                              {p?.last_seen_at ? fmtRelative(p.last_seen_at) : 'sin registro'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <Card className="mt-4">
              <CardContent className="p-5">
                <h3 className="text-[14px] font-semibold">Los 5 roles del sistema</h3>
                <p className="text-muted-foreground mt-1 text-[12.5px]">
                  El control de accesos se aplica en tres capas: políticas RLS en la base de datos,
                  middleware de rutas y guardas en la interfaz. La base de datos es la fuente de verdad.
                </p>
                <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
                  {Object.entries(ROLES).map(([k, r]) => (
                    <li key={k} className="bg-muted/40 flex items-start gap-3 rounded-lg p-3">
                      <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold">{r.label}</span>
                        <span className="text-muted-foreground block text-[11.5px] leading-snug">{r.description}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Servicios ──────────────────────────────────────────────── */}
          <TabsContent value="servicios" className="mt-4 space-y-3">
            {services.map((s) => (
              <Card key={s.id} className={cn(s.id === service.id && 'ring-primary/30 ring-2')}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white"
                      style={{ background: s.color }}
                    >
                      {s.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold">{s.name}</h3>
                        {s.id === service.id && <Badge>Servicio activo</Badge>}
                        <Badge variant="outline">{ROLES[s.role].label}</Badge>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-[12.5px]">
                        {s.client_name}
                        {s.contract_code ? ` · Contrato ${s.contract_code}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                      Módulos habilitados en este servicio
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {Object.entries(s.modules).map(([k, v]) => (
                        <div
                          key={k}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px]',
                            v ? 'border-success/30 bg-success/5' : 'border-border bg-muted/30 opacity-60'
                          )}
                        >
                          {v ? <CircleCheck className="text-success size-3.5" /> : <CircleX className="text-muted-foreground size-3.5" />}
                          <span className="capitalize">{k}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-muted-foreground mt-2.5 text-[11.5px] leading-snug">
                      El multi-servicio permite operar contratos completos (con PCI y SSOMA) junto a otros
                      más simples, manteniendo la información completamente separada por servicio.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ── Tramos ─────────────────────────────────────────────────── */}
          <TabsContent value="tramos" className="mt-4">
            {sections.isLoading ? (
              <SkeletonTable rows={6} cols={6} />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-muted/40 text-muted-foreground text-[11px] tracking-wide uppercase">
                      <tr>
                        {['Código', 'Tramo', 'Ruta', 'Progresivas', 'Longitud', 'Superficie', 'Carriles', 'Geometría'].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sections.data?.map((s: any) => (
                        <tr key={s.id} className="hover:bg-secondary/40">
                          <td className="px-4 py-3 font-mono text-[11.5px]">{s.code}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ background: s.color }} />
                              <span className="font-medium">{s.name}</span>
                            </span>
                          </td>
                          <td className="text-muted-foreground px-4 py-3">{s.route_code ?? '—'}</td>
                          <td className="px-4 py-3">
                            <Progresiva from={s.prog_start_m} to={s.prog_end_m} />
                          </td>
                          <td className="px-4 py-3 tabular-nums">{fmtNumber(Number(s.length_m) / 1000, 1)} km</td>
                          <td className="text-muted-foreground px-4 py-3">{s.surface ?? '—'}</td>
                          <td className="px-4 py-3 tabular-nums">{s.lanes ?? '—'}</td>
                          <td className="px-4 py-3">
                            {s.geom ? (
                              <Badge variant="success" className="gap-1"><CircleCheck className="size-2.5" />Trazada</Badge>
                            ) : (
                              <Badge variant="secondary">Sin geometría</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ── Actividades ────────────────────────────────────────────── */}
          <TabsContent value="actividades" className="mt-4">
            {activities.isLoading ? (
              <SkeletonTable rows={8} cols={6} />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-muted/40 text-muted-foreground text-[11px] tracking-wide uppercase">
                      <tr>
                        {['Código', 'Actividad', 'Categoría', 'Unidad', 'Rendimiento/día', 'Evidencia'].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {activities.data?.map((a: any) => (
                        <tr key={a.id} className="hover:bg-secondary/40">
                          <td className="px-4 py-3 font-mono text-[11.5px]">{a.code}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ background: a.color }} />
                              <span className="font-medium">{a.name}</span>
                            </span>
                          </td>
                          <td className="text-muted-foreground px-4 py-3">{a.category}</td>
                          <td className="px-4 py-3">{a.units?.symbol}</td>
                          <td className="px-4 py-3 tabular-nums">{fmtNumber(a.yield_per_day)}</td>
                          <td className="px-4 py-3">
                            {a.requires_photo ? (
                              <Badge variant="warning">mín. {a.min_photos} fotos</Badge>
                            ) : (
                              <span className="text-muted-foreground text-[11.5px]">opcional</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ── Cuadrillas ─────────────────────────────────────────────── */}
          <TabsContent value="cuadrillas" className="mt-4 space-y-3">
            {crews.isLoading ? (
              <SkeletonTable rows={4} cols={4} />
            ) : (
              crews.data?.map((c: any) => (
                <Card key={c.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="size-3 shrink-0 rounded-full" style={{ background: c.color }} />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14.5px] font-semibold">{c.name}</h3>
                        <p className="text-muted-foreground text-[12px]">
                          {c.code} · Jefe: {c.profiles?.full_name ?? 'sin asignar'}
                          {c.vehicle ? ` · ${c.vehicle}` : ''}
                          {c.plate ? ` (${c.plate})` : ''}
                        </p>
                      </div>
                      <Badge variant="secondary">{c.crew_members?.length ?? 0} integrantes</Badge>
                    </div>
                    <ul className="mt-3.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {c.crew_members?.map((m: any) => (
                        <li key={m.id} className="bg-muted/40 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px]">
                          <span className="bg-card flex size-7 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold">
                            {initials(m.full_name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{m.full_name}</span>
                            <span className="text-muted-foreground block text-[10.5px]">
                              {m.position} · DNI {m.dni}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ── Dispositivo ────────────────────────────────────────────── */}
          <TabsContent value="dispositivo" className="mt-4">
            <DeviceSettings />
          </TabsContent>

          {/* ── Seguridad ──────────────────────────────────────────────── */}
          {can.manage && (
            <TabsContent value="seguridad" className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { icon: ShieldCheck, title: 'RLS activo', body: 'Todas las tablas tienen políticas de seguridad a nivel de fila. Nadie ve datos de un servicio al que no pertenece.', tone: 'success' },
                  { icon: Database, title: 'Evidencia inmutable', body: 'Un trigger bloquea la edición de GPS, fecha y hash. Storage no permite UPDATE ni DELETE sobre las fotos.', tone: 'success' },
                  { icon: Activity, title: 'Auditoría completa', body: 'Cada alta, cambio y baja en tablas sensibles queda registrada con quién, qué, cuándo y el antes/después.', tone: 'success' },
                ].map((c) => (
                  <Card key={c.title}>
                    <CardContent className="p-4">
                      <span className="bg-success/12 text-success flex size-9 items-center justify-center rounded-lg">
                        <c.icon className="size-4" />
                      </span>
                      <h4 className="mt-3 text-[13.5px] font-semibold">{c.title}</h4>
                      <p className="text-muted-foreground mt-1 text-[12px] leading-snug">{c.body}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="text-[13.5px] font-semibold">Registro de auditoría</h3>
                  <p className="text-muted-foreground text-[11.5px]">Últimos 60 eventos del servicio activo</p>
                </div>
                {audit.isLoading ? (
                  <SkeletonTable rows={8} cols={4} />
                ) : !audit.data?.length ? (
                  <EmptyState icon={Activity} title="Sin eventos registrados" />
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-[12px]">
                      <tbody className="divide-y divide-border">
                        {audit.data.map((a: any) => (
                          <tr key={a.id} className="hover:bg-secondary/40">
                            <td className="px-4 py-2 w-24">
                              <Badge
                                variant="outline"
                                className={cn(
                                  a.action === 'INSERT' && 'border-success/40 text-success',
                                  a.action === 'UPDATE' && 'border-info/40 text-info',
                                  a.action === 'DELETE' && 'border-destructive/40 text-destructive'
                                )}
                              >
                                {a.action}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 font-mono text-[11px]">{a.table_name}</td>
                            <td className="text-muted-foreground px-4 py-2">{a.actor_email ?? 'sistema'}</td>
                            <td className="text-muted-foreground px-4 py-2 text-right text-[11px]">
                              {fmtRelative(a.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </PageBody>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function DeviceSettings() {
  const [storage, setStorage] = React.useState<any>(null)
  const [push, setPush] = React.useState<NotificationPermission | 'unsupported'>('default')
  const [standalone, setStandalone] = React.useState(false)

  React.useEffect(() => {
    void storageEstimate().then(setStorage)
    setPush(pushSupported() ? pushPermission() : 'unsupported')
    setStandalone(isStandalone())
  }, [])

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <CardContent className="p-5">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            <HardDrive className="size-4" />
            Almacenamiento local
          </h3>
          <p className="text-muted-foreground mt-1 text-[12.5px]">
            Espacio que la app usa en este dispositivo para trabajar sin conexión.
          </p>
          {storage && (
            <>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-xl font-bold tabular-nums">{bytes(storage.usage)}</span>
                <span className="text-muted-foreground text-[12px]">de {bytes(storage.quota)}</span>
              </div>
              <div className="bg-secondary mt-2 h-2 overflow-hidden rounded-full">
                <div
                  className={cn('h-full rounded-full', storage.pct > 85 ? 'bg-destructive' : 'bg-primary')}
                  style={{ width: `${Math.min(storage.pct, 100)}%` }}
                />
              </div>
              <p className="text-muted-foreground mt-2 text-[11.5px]">
                Las evidencias ya sincronizadas se purgan automáticamente a los 7 días.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            <Bell className="size-4" />
            Notificaciones push
          </h3>
          <p className="text-muted-foreground mt-1 text-[12.5px]">
            Avisos de PCIs por vencer, partes observados y reprogramaciones, aun con la app cerrada.
          </p>

          <div className="mt-4 space-y-2.5">
            <StatusRow
              ok={standalone}
              label="App instalada en el dispositivo"
              hint={standalone ? 'Corriendo como aplicación instalada' : isIOS() ? 'En iPhone es obligatorio para recibir push' : 'Opcional en Android y escritorio'}
            />
            <StatusRow
              ok={push === 'granted'}
              label="Permiso de notificaciones"
              hint={
                push === 'granted' ? 'Concedido'
                : push === 'denied' ? 'Bloqueado desde los ajustes del navegador'
                : push === 'unsupported' ? 'No soportado en este navegador'
                : 'Pendiente de activar'
              }
            />
          </div>

          {push !== 'granted' && push !== 'unsupported' && (
            <Button
              variant="accent"
              size="sm"
              className="mt-4 w-full"
              onClick={async () => {
                const ok = await enablePush()
                setPush(pushPermission())
                toast[ok ? 'success' : 'error'](ok ? 'Notificaciones activadas' : 'No se pudieron activar')
              }}
            >
              <Bell className="size-3.5" />
              Activar notificaciones
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusRow({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="bg-muted/40 flex items-start gap-2.5 rounded-lg px-3 py-2.5">
      {ok ? (
        <CircleCheck className="text-success mt-0.5 size-4 shrink-0" />
      ) : (
        <CircleX className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium">{label}</p>
        <p className="text-muted-foreground text-[11px]">{hint}</p>
      </div>
    </div>
  )
}
