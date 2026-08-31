'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Users, Route, ListChecks, Truck, Building2, ShieldCheck,
  Database, HardDrive, Bell, CircleCheck, CircleX, Activity, Plus,
  Pencil, UserPlus, KeyRound, Trash2, Copy,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent, Switch, Avatar, AvatarFallback, Tip } from '@/components/ui/primitives'
import { SkeletonTable } from '@/components/ui/skeleton'
import { Progresiva, EmptyState } from '@/components/shared/misc'
import { FormDialog, ConfirmDialog, type FormField } from '@/components/forms/form-dialog'
import { SectionGeometryDialog } from '@/components/config/section-geometry'
import { ServiceForm } from '@/components/config/service-form'
import { ROLES, ASSET_CONDITION, type Role } from '@/lib/constants'
import { cn, fmtDate, fmtNumber, fmtRelative, initials, bytes, parseProgresiva, fmtProgresiva } from '@/lib/utils'
import { storageEstimate } from '@/lib/offline/db'
import { pushSupported, pushPermission, enablePush, isStandalone, isIOS } from '@/lib/push'
import { toast } from 'sonner'

export function ConfiguracionClient() {
  const { service, services, can, profile, switchService } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])
  const [tab, setTab] = React.useState('usuarios')

  // ─── Estado de los diálogos ─────────────────────────────────────────────
  const [userForm, setUserForm] = React.useState<{ open: boolean; row?: any }>({ open: false })
  const [crewForm, setCrewForm] = React.useState<{ open: boolean; row?: any }>({ open: false })
  const [memberForm, setMemberForm] = React.useState<{ open: boolean; crew?: any }>({ open: false })
  const [sectionForm, setSectionForm] = React.useState<{ open: boolean; row?: any }>({ open: false })
  const [activityForm, setActivityForm] = React.useState<{ open: boolean; row?: any }>({ open: false })
  const [passForm, setPassForm] = React.useState<{ open: boolean; row?: any }>({ open: false })
  const [confirm, setConfirm] = React.useState<{ open: boolean; title: string; description?: string; confirmLabel?: string; action?: () => Promise<void> }>({ open: false, title: '' })
  const [newCred, setNewCred] = React.useState<{ email: string; password: string } | null>(null)
  const [geomSection, setGeomSection] = React.useState<any>(null)
  const [serviceForm, setServiceForm] = React.useState(false)

  const refresh = () => qc.invalidateQueries()

  // ─── Consultas ──────────────────────────────────────────────────────────
  const members = useQuery({
    queryKey: ['members', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('service_members')
        .select('id, role, created_at, profiles(id, full_name, email, position, phone, dni, is_active, last_seen_at)')
        .eq('service_id', service.id)
      return data ?? []
    },
  })

  const sections = useQuery({
    queryKey: ['sections-config', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('road_sections').select('*').eq('service_id', service.id)
        .is('deleted_at', null).order('prog_start_m')
      return data ?? []
    },
  })

  const activities = useQuery({
    queryKey: ['activities-config', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('activities_catalog').select('*, units(symbol, name)').eq('service_id', service.id)
        .is('deleted_at', null).order('code')
      return data ?? []
    },
  })

  const crews = useQuery({
    queryKey: ['crews-config', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('crews')
        .select('*, crew_members(id, full_name, dni, position, is_active), profiles:leader_id(full_name)')
        .eq('service_id', service.id).is('deleted_at', null).order('code')
      return data ?? []
    },
  })

  const units = useQuery({
    queryKey: ['units'],
    queryFn: async () => (await sb.from('units').select('id, code, symbol, name').order('code')).data ?? [],
    staleTime: 10 * 60_000,
  })

  const audit = useQuery({
    queryKey: ['audit', service.id],
    enabled: tab === 'seguridad',
    queryFn: async () => {
      const { data } = await sb
        .from('audit_log').select('id, table_name, action, actor_email, created_at, record_id')
        .eq('service_id', service.id).order('created_at', { ascending: false }).limit(60)
      return data ?? []
    },
  })

  // ─── Definición de formularios ──────────────────────────────────────────
  const roleOptions = (Object.keys(ROLES) as Role[]).map((r) => ({
    value: r,
    label: `${ROLES[r].label}${ROLES[r].alias ? ` · ${ROLES[r].alias}` : ''}`,
    color: ROLES[r].color,
  }))

  const userFields: FormField[] = [
    { name: 'full_name', label: 'Nombre completo', type: 'text', required: true, span: 2, placeholder: 'Marco Quispe Ramos' },
    { name: 'email', label: 'Correo electrónico', type: 'email', required: true, placeholder: 'capataz@etsvaleria.pe' },
    { name: 'role', label: 'Rol en el servicio', type: 'select', required: true, options: roleOptions },
    { name: 'dni', label: 'DNI', type: 'text', placeholder: '43128907' },
    { name: 'phone', label: 'Teléfono', type: 'tel', placeholder: '+51 987 654 321' },
    { name: 'position', label: 'Cargo', type: 'text', span: 2, placeholder: 'Jefe de Cuadrilla A' },
    {
      name: 'crew_id', label: 'Cuadrilla que lidera', type: 'select',
      hint: 'Solo para capataces / jefes de cuadrilla',
      showIf: (v) => v.role === 'jefe_cuadrilla',
      options: (crews.data ?? []).map((c: any) => ({ value: c.id, label: `${c.code} · ${c.name}`, color: c.color })),
    },
    { name: 'is_active', label: 'Usuario activo', type: 'switch', span: 2, defaultValue: true },
  ]

  const crewFields: FormField[] = [
    { name: 'code', label: 'Código', type: 'text', required: true, placeholder: 'CUA-E' },
    { name: 'name', label: 'Nombre', type: 'text', required: true, placeholder: 'Cuadrilla E · Drenaje' },
    {
      name: 'leader_id', label: 'Jefe de cuadrilla', type: 'select',
      options: (members.data ?? [])
        .filter((m: any) => m.role === 'jefe_cuadrilla')
        .map((m: any) => ({ value: m.profiles.id, label: m.profiles.full_name })),
    },
    { name: 'color', label: 'Color en el mapa', type: 'color', defaultValue: '#0EA5E9' },
    { name: 'vehicle', label: 'Vehículo', type: 'text', placeholder: 'Camioneta Toyota Hilux 4x4' },
    { name: 'plate', label: 'Placa', type: 'text', placeholder: 'B7K-842' },
    { name: 'is_active', label: 'Cuadrilla activa', type: 'switch', span: 2, defaultValue: true },
  ]

  const memberFields: FormField[] = [
    { name: 'full_name', label: 'Nombre completo', type: 'text', required: true, span: 2 },
    { name: 'dni', label: 'DNI', type: 'text' },
    {
      name: 'position', label: 'Cargo', type: 'select', required: true,
      options: ['Jefe de cuadrilla', 'Operario', 'Oficial', 'Peón', 'Conductor', 'Vigía']
        .map((p) => ({ value: p, label: p })),
    },
  ]

  const sectionFields: FormField[] = [
    { name: 'code', label: 'Código', type: 'text', required: true, placeholder: 'T-07' },
    { name: 'route_code', label: 'Ruta', type: 'text', placeholder: 'PE-1N' },
    { name: 'name', label: 'Nombre del tramo', type: 'text', required: true, span: 2, placeholder: 'Trujillo – Chicama' },
    { name: 'prog_start', label: 'Progresiva inicial', type: 'progresiva', required: true, placeholder: '356+000', hint: 'Formato km+m' },
    { name: 'prog_end', label: 'Progresiva final', type: 'progresiva', required: true, placeholder: '392+500' },
    {
      name: 'surface', label: 'Superficie', type: 'select',
      options: ['Asfalto', 'Afirmado', 'Concreto', 'Trocha'].map((s) => ({ value: s, label: s })),
    },
    { name: 'lanes', label: 'Carriles', type: 'number', min: 1, max: 8, placeholder: '4' },
    { name: 'color', label: 'Color en el mapa', type: 'color', defaultValue: '#2563EB' },
    { name: 'is_active', label: 'Tramo activo', type: 'switch', defaultValue: true },
  ]

  const activityFields: FormField[] = [
    { name: 'code', label: 'Código', type: 'text', required: true, placeholder: 'MR-21' },
    {
      name: 'category', label: 'Categoría', type: 'select', required: true,
      options: ['Calzada', 'Drenaje', 'Señalización', 'Seguridad vial', 'Derecho de vía', 'Emergencias']
        .map((c) => ({ value: c, label: c })),
    },
    { name: 'name', label: 'Nombre de la actividad', type: 'text', required: true, span: 2, placeholder: 'Limpieza de sumideros' },
    {
      name: 'unit_id', label: 'Unidad de medida', type: 'select', required: true,
      options: (units.data ?? []).map((u: any) => ({ value: u.id, label: `${u.symbol} · ${u.name}` })),
    },
    { name: 'yield_per_day', label: 'Rendimiento por día', type: 'number', step: 0.1, placeholder: '18' },
    { name: 'min_photos', label: 'Fotos mínimas exigidas', type: 'number', min: 0, max: 10, defaultValue: 2 },
    { name: 'color', label: 'Color', type: 'color', defaultValue: '#64748B' },
    { name: 'requires_photo', label: 'Exige evidencia fotográfica', type: 'switch', span: 2, defaultValue: true },
    { name: 'is_active', label: 'Actividad activa', type: 'switch', span: 2, defaultValue: true },
  ]

  // ─── Acciones ───────────────────────────────────────────────────────────
  const saveUser = async (v: any) => {
    const isEdit = !!userForm.row
    const res = await fetch('/api/usuarios', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...v, id: userForm.row?.profiles?.id, service_id: service.id }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'No se pudo guardar el usuario'); return }
    if (!isEdit && json.password) setNewCred({ email: json.email, password: json.password })
    toast.success(isEdit ? 'Usuario actualizado' : 'Usuario creado')
    refresh()
  }

  const saveCrew = async (v: any) => {
    const payload = {
      service_id: service.id,
      code: v.code, name: v.name,
      leader_id: v.leader_id || null,
      color: v.color || '#0EA5E9',
      vehicle: v.vehicle || null, plate: v.plate || null,
      is_active: !!v.is_active,
    }
    const { error } = crewForm.row
      ? await sb.from('crews').update(payload).eq('id', crewForm.row.id)
      : await sb.from('crews').insert({ ...payload, created_by: profile.id })
    if (error) { toast.error(error.message); return }
    toast.success(crewForm.row ? 'Cuadrilla actualizada' : 'Cuadrilla creada')
    refresh()
  }

  const saveMember = async (v: any) => {
    const { error } = await sb.from('crew_members').insert({
      crew_id: memberForm.crew.id,
      full_name: v.full_name,
      dni: v.dni || null,
      position: v.position,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Integrante agregado')
    refresh()
  }

  const saveSection = async (v: any) => {
    const start = parseProgresiva(String(v.prog_start))
    const end = parseProgresiva(String(v.prog_end))
    if (start == null || end == null) { toast.error('Progresivas no válidas. Usa el formato 12+450'); return }
    if (end <= start) { toast.error('La progresiva final debe ser mayor que la inicial'); return }

    const payload = {
      service_id: service.id,
      code: v.code, name: v.name, route_code: v.route_code || null,
      prog_start_m: start, prog_end_m: end,
      surface: v.surface || null,
      lanes: v.lanes ? Number(v.lanes) : null,
      color: v.color || '#2563EB',
      is_active: !!v.is_active,
    }
    const { error } = sectionForm.row
      ? await sb.from('road_sections').update(payload).eq('id', sectionForm.row.id)
      : await sb.from('road_sections').insert({ ...payload, created_by: profile.id })
    if (error) { toast.error(error.message); return }
    toast.success(sectionForm.row ? 'Tramo actualizado' : 'Tramo creado')
    refresh()
  }

  /**
   * Baja lógica de un elemento de catálogo. No se borra de verdad: el trabajo
   * ya registrado sigue apuntando a él, así que solo deja de ofrecerse.
   */
  const softDelete = (
    table: 'crews' | 'road_sections' | 'activities_catalog',
    row: any,
    etiqueta: string,
    nota: string
  ) =>
    setConfirm({
      open: true,
      title: `¿Eliminar ${etiqueta} «${row.name}»?`,
      description: `${nota} El historial ya registrado se conserva y no se pierde ningún dato.`,
      confirmLabel: 'Sí, eliminar',
      action: async () => {
        const { error } = await sb.from(table)
          .update({ deleted_at: new Date().toISOString() }).eq('id', row.id)
        if (error) { toast.error(error.message); return }
        toast.success(`${etiqueta[0].toUpperCase()}${etiqueta.slice(1)} eliminada`)
        refresh()
      },
    })

  const saveActivity = async (v: any) => {
    const payload = {
      service_id: service.id,
      code: v.code, name: v.name, category: v.category,
      unit_id: v.unit_id,
      yield_per_day: v.yield_per_day ? Number(v.yield_per_day) : null,
      min_photos: v.min_photos ? Number(v.min_photos) : 2,
      requires_photo: !!v.requires_photo,
      color: v.color || '#64748B',
      is_active: !!v.is_active,
    }
    const { error } = activityForm.row
      ? await sb.from('activities_catalog').update(payload).eq('id', activityForm.row.id)
      : await sb.from('activities_catalog').insert({ ...payload, created_by: profile.id })
    if (error) { toast.error(error.message); return }
    toast.success(activityForm.row ? 'Actividad actualizada' : 'Actividad creada')
    refresh()
  }

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
            <TabsTrigger value="cuadrillas"><Truck className="size-3.5" />Cuadrillas</TabsTrigger>
            <TabsTrigger value="tramos"><Route className="size-3.5" />Tramos</TabsTrigger>
            <TabsTrigger value="actividades"><ListChecks className="size-3.5" />Actividades</TabsTrigger>
            <TabsTrigger value="servicios"><Building2 className="size-3.5" />Servicios</TabsTrigger>
            <TabsTrigger value="dispositivo"><HardDrive className="size-3.5" />Dispositivo</TabsTrigger>
            {can.manage && <TabsTrigger value="seguridad"><ShieldCheck className="size-3.5" />Seguridad</TabsTrigger>}
          </TabsList>

          {/* ═══ USUARIOS ══════════════════════════════════════════════════ */}
          <TabsContent value="usuarios" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">Usuarios del servicio</h2>
                <p className="text-muted-foreground text-[12.5px]">
                  {members.data?.length ?? 0} personas con acceso a {service.name}
                </p>
              </div>
              {can.manage && (
                <Button onClick={() => setUserForm({ open: true })}>
                  <UserPlus className="size-4" />
                  Nuevo usuario
                </Button>
              )}
            </div>

            {members.isLoading ? (
              <SkeletonTable rows={6} cols={5} />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-muted/40 text-muted-foreground text-[11px] tracking-wide uppercase">
                      <tr>
                        {['Usuario', 'Rol', 'Cargo', 'Contacto', 'Estado', 'Última actividad', ''].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {members.data?.map((m: any) => {
                        const p = m.profiles
                        const role = ROLES[m.role as Role]
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
                              <span className="text-muted-foreground mt-0.5 block text-[10.5px]">{role.alias}</span>
                            </td>
                            <td className="text-muted-foreground px-4 py-3">{p?.position ?? '—'}</td>
                            <td className="text-muted-foreground px-4 py-3 tabular-nums">
                              {p?.phone ?? '—'}
                              {p?.dni && <span className="block text-[10.5px]">DNI {p.dni}</span>}
                            </td>
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
                            <td className="px-4 py-3">
                              {can.manage && (
                                <div className="flex justify-end gap-1">
                                  <Tip label="Editar">
                                    <Button variant="ghost" size="icon-sm" onClick={() => setUserForm({ open: true, row: m })}>
                                      <Pencil className="size-3.5" />
                                    </Button>
                                  </Tip>
                                  <Tip label="Restablecer contraseña">
                                    <Button variant="ghost" size="icon-sm" onClick={() => setPassForm({ open: true, row: m })}>
                                      <KeyRound className="size-3.5" />
                                    </Button>
                                  </Tip>
                                  <Tip label="Quitar del servicio">
                                    <Button
                                      variant="ghost" size="icon-sm"
                                      disabled={p?.id === profile.id}
                                      onClick={() => setConfirm({
                                        open: true,
                                        title: `¿Quitar a ${p.full_name} del servicio?`,
                                        description: 'Pierde el acceso a este contrato. Su cuenta y su historial se conservan.',
                                        action: async () => {
                                          const res = await fetch(`/api/usuarios?id=${p.id}&service_id=${service.id}`, { method: 'DELETE' })
                                          const j = await res.json()
                                          if (!res.ok) { toast.error(j.error); return }
                                          toast.success('Usuario retirado del servicio')
                                          refresh()
                                        },
                                      })}
                                    >
                                      <Trash2 className="text-destructive size-3.5" />
                                    </Button>
                                  </Tip>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <Card>
              <CardContent className="p-5">
                <h3 className="text-[14px] font-semibold">Los 5 roles y cómo se llaman en obra</h3>
                <p className="text-muted-foreground mt-1 text-[12.5px]">
                  El control de accesos se aplica en tres capas: políticas RLS en la base de datos,
                  middleware de rutas y guardas en la interfaz. La base de datos es la fuente de verdad.
                </p>
                <ul className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {(Object.keys(ROLES) as Role[]).map((k) => {
                    const r = ROLES[k]
                    const n = (members.data ?? []).filter((m: any) => m.role === k).length
                    return (
                      <li key={k} className="bg-muted/40 flex items-start gap-3 rounded-lg p-3">
                        <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold">{r.label}</span>
                            <Badge variant="secondary" className="text-[10px]">{r.alias}</Badge>
                          </span>
                          <span className="text-muted-foreground block text-[11.5px] leading-snug">{r.description}</span>
                        </span>
                        <span className="text-[13px] font-bold tabular-nums">{n}</span>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══ CUADRILLAS ════════════════════════════════════════════════ */}
          <TabsContent value="cuadrillas" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">Cuadrillas</h2>
                <p className="text-muted-foreground text-[12.5px]">
                  {crews.data?.length ?? 0} cuadrillas ·{' '}
                  {(crews.data ?? []).reduce((s: number, c: any) => s + (c.crew_members?.length ?? 0), 0)} integrantes
                </p>
              </div>
              {can.manage && (
                <Button onClick={() => setCrewForm({ open: true })}>
                  <Plus className="size-4" />
                  Nueva cuadrilla
                </Button>
              )}
            </div>

            {crews.isLoading ? (
              <SkeletonTable rows={4} cols={4} />
            ) : !crews.data?.length ? (
              <Card><CardContent className="p-0">
                <EmptyState icon={Truck} title="Sin cuadrillas" description="Crea la primera cuadrilla para poder programar y registrar trabajo en campo."
                  action={can.manage && <Button onClick={() => setCrewForm({ open: true })}><Plus className="size-4" />Nueva cuadrilla</Button>} />
              </CardContent></Card>
            ) : (
              crews.data.map((c: any) => (
                <Card key={c.id}>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: c.color }} />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14.5px] font-semibold">{c.name}</h3>
                        <p className="text-muted-foreground text-[12px]">
                          {c.code} · Jefe: {c.profiles?.full_name ?? 'sin asignar'}
                          {c.vehicle ? ` · ${c.vehicle}` : ''}
                          {c.plate ? ` (${c.plate})` : ''}
                        </p>
                      </div>
                      <Badge variant="secondary">{c.crew_members?.length ?? 0} integrantes</Badge>
                      {can.manage && (
                        <div className="flex gap-1">
                          <Tip label="Editar cuadrilla">
                            <Button variant="ghost" size="icon-sm" onClick={() => setCrewForm({ open: true, row: c })}>
                              <Pencil className="size-3.5" />
                            </Button>
                          </Tip>
                          <Tip label="Eliminar cuadrilla">
                            <Button
                              variant="ghost" size="icon-sm"
                              onClick={() => softDelete('crews', c, 'la cuadrilla',
                                'Dejará de aparecer en la programación y en los partes nuevos.')}
                            >
                              <Trash2 className="text-destructive size-3.5" />
                            </Button>
                          </Tip>
                          <Button variant="outline" size="sm" onClick={() => setMemberForm({ open: true, crew: c })}>
                            <Plus className="size-3.5" />
                            Integrante
                          </Button>
                        </div>
                      )}
                    </div>
                    <ul className="mt-3.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                      {c.crew_members?.map((m: any) => (
                        <li key={m.id} className="bg-muted/40 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px]">
                          <span className="bg-card flex size-7 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold">
                            {initials(m.full_name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{m.full_name}</span>
                            <span className="text-muted-foreground block text-[10.5px]">
                              {m.position}{m.dni ? ` · DNI ${m.dni}` : ''}
                            </span>
                          </span>
                          {can.manage && (
                            <button
                              onClick={() => setConfirm({
                                open: true,
                                title: `¿Retirar a ${m.full_name}?`,
                                description: 'Se quita de la cuadrilla. El historial de trabajo se conserva.',
                                action: async () => {
                                  const { error } = await sb.from('crew_members').delete().eq('id', m.id)
                                  if (error) { toast.error(error.message); return }
                                  toast.success('Integrante retirado')
                                  refresh()
                                },
                              })}
                              className="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
                              aria-label={`Retirar a ${m.full_name}`}
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* ═══ TRAMOS ════════════════════════════════════════════════════ */}
          <TabsContent value="tramos" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">Tramos y progresivas</h2>
                <p className="text-muted-foreground text-[12.5px]">
                  {sections.data?.length ?? 0} tramos ·{' '}
                  {fmtNumber((sections.data ?? []).reduce((s: number, r: any) => s + Number(r.length_m ?? 0), 0) / 1000, 1)} km
                </p>
              </div>
              {can.manage && (
                <Button onClick={() => setSectionForm({ open: true })}>
                  <Plus className="size-4" />
                  Nuevo tramo
                </Button>
              )}
            </div>

            {sections.isLoading ? (
              <SkeletonTable rows={6} cols={6} />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-muted/40 text-muted-foreground text-[11px] tracking-wide uppercase">
                      <tr>
                        {['Código', 'Tramo', 'Ruta', 'Progresivas', 'Longitud', 'Superficie', 'Carriles', 'Geometría', ''].map((h) => (
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
                          <td className="px-4 py-3"><Progresiva from={s.prog_start_m} to={s.prog_end_m} /></td>
                          <td className="px-4 py-3 tabular-nums">{fmtNumber(Number(s.length_m) / 1000, 1)} km</td>
                          <td className="text-muted-foreground px-4 py-3">{s.surface ?? '—'}</td>
                          <td className="px-4 py-3 tabular-nums">{s.lanes ?? '—'}</td>
                          <td className="px-4 py-3">
                            {s.geom
                              ? <Badge variant="success" className="gap-1"><CircleCheck className="size-2.5" />Trazada</Badge>
                              : <Badge variant="secondary">Sin geometría</Badge>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {can.manage && (
                              <span className="flex justify-end gap-1">
                                <Tip label={s.geom ? 'Reemplazar el trazo' : 'Cargar el trazo (KML/KMZ)'}>
                                  <Button variant="ghost" size="icon-sm" onClick={() => setGeomSection(s)}>
                                    <Route className={cn('size-3.5', !s.geom && 'text-warning')} />
                                  </Button>
                                </Tip>
                                <Tip label="Editar tramo">
                                  <Button variant="ghost" size="icon-sm" onClick={() => setSectionForm({ open: true, row: s })}>
                                    <Pencil className="size-3.5" />
                                  </Button>
                                </Tip>
                                <Tip label="Eliminar tramo">
                                  <Button
                                    variant="ghost" size="icon-sm"
                                    onClick={() => softDelete('road_sections', s, 'el tramo',
                                      'Dejará de aparecer en el mapa y al registrar trabajo nuevo.')}
                                  >
                                    <Trash2 className="text-destructive size-3.5" />
                                  </Button>
                                </Tip>
                              </span>
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

          {/* ═══ ACTIVIDADES ═══════════════════════════════════════════════ */}
          <TabsContent value="actividades" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">Catálogo de actividades</h2>
                <p className="text-muted-foreground text-[12.5px]">
                  {activities.data?.length ?? 0} partidas de mantenimiento rutinario
                </p>
              </div>
              {can.manage && (
                <Button onClick={() => setActivityForm({ open: true })}>
                  <Plus className="size-4" />
                  Nueva actividad
                </Button>
              )}
            </div>

            {activities.isLoading ? (
              <SkeletonTable rows={8} cols={6} />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-muted/40 text-muted-foreground text-[11px] tracking-wide uppercase">
                      <tr>
                        {['Código', 'Actividad', 'Categoría', 'Unidad', 'Rendimiento/día', 'Evidencia', ''].map((h) => (
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
                            {a.requires_photo
                              ? <Badge variant="warning">mín. {a.min_photos} fotos</Badge>
                              : <span className="text-muted-foreground text-[11.5px]">opcional</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {can.manage && (
                              <span className="flex justify-end gap-1">
                                <Tip label="Editar actividad">
                                  <Button variant="ghost" size="icon-sm" onClick={() => setActivityForm({ open: true, row: a })}>
                                    <Pencil className="size-3.5" />
                                  </Button>
                                </Tip>
                                <Tip label="Eliminar actividad">
                                  <Button
                                    variant="ghost" size="icon-sm"
                                    onClick={() => softDelete('activities_catalog', a, 'la actividad',
                                      'Dejará de ofrecerse al programar y al registrar metrados.')}
                                  >
                                    <Trash2 className="text-destructive size-3.5" />
                                  </Button>
                                </Tip>
                              </span>
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

          {/* ═══ SERVICIOS ═════════════════════════════════════════════════ */}
          <TabsContent value="servicios" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">Servicios y contratos</h2>
                <p className="text-muted-foreground text-[12.5px]">
                  {services.length} contrato{services.length === 1 ? '' : 's'} con tu usuario dentro
                </p>
              </div>
              {can.admin && (
                <Button onClick={() => setServiceForm(true)}>
                  <Plus className="size-4" />
                  Nuevo servicio
                </Button>
              )}
            </div>

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
                        {s.client_name}{s.contract_code ? ` · Contrato ${s.contract_code}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
                      Módulos habilitados en este servicio
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
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

          {/* ═══ DISPOSITIVO ═══════════════════════════════════════════════ */}
          <TabsContent value="dispositivo" className="mt-4">
            <DeviceSettings />
          </TabsContent>

          {/* ═══ SEGURIDAD ═════════════════════════════════════════════════ */}
          {can.manage && (
            <TabsContent value="seguridad" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {[
                  { icon: ShieldCheck, title: 'RLS activo', body: 'Todas las tablas tienen políticas de seguridad a nivel de fila. Nadie ve datos de un servicio al que no pertenece.' },
                  { icon: Database, title: 'Evidencia inmutable', body: 'Un trigger bloquea la edición de GPS, fecha y hash. Storage no permite UPDATE ni DELETE sobre las fotos.' },
                  { icon: Activity, title: 'Auditoría completa', body: 'Cada alta, cambio y baja en tablas sensibles queda registrada con quién, qué, cuándo y el antes/después.' },
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
                            <td className="w-24 px-4 py-2">
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

      {/* ═══ DIÁLOGOS ═══════════════════════════════════════════════════════ */}
      <FormDialog
        open={userForm.open}
        onOpenChange={(v) => setUserForm({ open: v, row: v ? userForm.row : undefined })}
        title={userForm.row ? 'Editar usuario' : 'Nuevo usuario'}
        description={userForm.row
          ? 'Actualiza los datos y el rol de la persona dentro de este servicio.'
          : 'Se crea la cuenta y se le da acceso a este servicio. La contraseña inicial se genera automáticamente.'}
        fields={userFields}
        initial={userForm.row ? { ...userForm.row.profiles, role: userForm.row.role } : undefined}
        submitLabel={userForm.row ? 'Guardar cambios' : 'Crear usuario'}
        onSubmit={saveUser}
        footerNote={!userForm.row && 'Al crear el usuario verás su contraseña inicial una sola vez: cópiala y entrégasela.'}
      />

      <FormDialog
        open={crewForm.open}
        onOpenChange={(v) => setCrewForm({ open: v, row: v ? crewForm.row : undefined })}
        title={crewForm.row ? 'Editar cuadrilla' : 'Nueva cuadrilla'}
        description="La cuadrilla agrupa al personal de campo y es la unidad con la que se programa y se registra el trabajo."
        fields={crewFields}
        initial={crewForm.row}
        onSubmit={saveCrew}
      />

      <FormDialog
        open={memberForm.open}
        onOpenChange={(v) => setMemberForm({ open: v, crew: v ? memberForm.crew : undefined })}
        title="Agregar integrante"
        description={memberForm.crew ? `Se suma a ${memberForm.crew.name}. No necesita cuenta de usuario para figurar en las asistencias.` : ''}
        fields={memberFields}
        size="sm"
        onSubmit={saveMember}
      />

      <SectionGeometryDialog section={geomSection} onClose={() => setGeomSection(null)} />

      <ServiceForm
        open={serviceForm}
        onOpenChange={setServiceForm}
        onCreated={(id) => {
          refresh()
          // Se entra al contrato recién creado: es lo que uno quiere hacer
          // enseguida (cargar sus tramos y su personal).
          if (id) switchService(id)
        }}
      />

      <FormDialog
        open={sectionForm.open}
        onOpenChange={(v) => setSectionForm({ open: v, row: v ? sectionForm.row : undefined })}
        title={sectionForm.row ? 'Editar tramo' : 'Nuevo tramo'}
        description="Los tramos definen el corredor y sus progresivas. Todo el trabajo de campo se ubica sobre ellos."
        fields={sectionFields}
        initial={sectionForm.row ? {
          ...sectionForm.row,
          prog_start: fmtProgresiva(sectionForm.row.prog_start_m),
          prog_end: fmtProgresiva(sectionForm.row.prog_end_m),
        } : undefined}
        onSubmit={saveSection}
        footerNote="La geometría del tramo (su trazo en el mapa) se carga por separado desde un KMZ o shapefile."
      />

      <FormDialog
        open={activityForm.open}
        onOpenChange={(v) => setActivityForm({ open: v, row: v ? activityForm.row : undefined })}
        title={activityForm.row ? 'Editar actividad' : 'Nueva actividad'}
        description="Las partidas del catálogo son lo que las cuadrillas eligen al registrar su trabajo."
        fields={activityFields}
        initial={activityForm.row}
        onSubmit={saveActivity}
      />

      <FormDialog
        open={passForm.open}
        onOpenChange={(v) => setPassForm({ open: v, row: v ? passForm.row : undefined })}
        title="Restablecer contraseña"
        description={passForm.row ? `Se asignará una nueva contraseña a ${passForm.row.profiles.full_name}.` : ''}
        size="sm"
        fields={[{ name: 'new_password', label: 'Nueva contraseña', type: 'text', required: true, span: 2, hint: 'Mínimo 8 caracteres. Entrégasela por un canal seguro.' }]}
        submitLabel="Restablecer"
        onSubmit={async (v) => {
          const res = await fetch('/api/usuarios', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: passForm.row.profiles.id, service_id: service.id, new_password: v.new_password }),
          })
          const j = await res.json()
          if (!res.ok) { toast.error(j.error); return }
          toast.success('Contraseña restablecida')
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(v) => setConfirm({ ...confirm, open: v })}
        title={confirm.title}
        description={confirm.description}
        confirmLabel={confirm.confirmLabel ?? "Sí, continuar"}
        onConfirm={async () => { await confirm.action?.() }}
      />

      {/* Credenciales recién creadas */}
      <ConfirmDialog
        open={!!newCred}
        onOpenChange={() => setNewCred(null)}
        destructive={false}
        title="Usuario creado"
        description={newCred ? `Entrega estas credenciales a ${newCred.email}. La contraseña no se vuelve a mostrar.` : ''}
        confirmLabel="Ya la copié"
        onConfirm={async () => {
          if (newCred) {
            await navigator.clipboard.writeText(`Usuario: ${newCred.email}\nContraseña: ${newCred.password}`).catch(() => {})
            toast.success('Credenciales copiadas')
          }
          setNewCred(null)
        }}
      />
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
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
              variant="accent" size="sm" className="mt-4 w-full"
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
      {ok ? <CircleCheck className="text-success mt-0.5 size-4 shrink-0" /> : <CircleX className="text-muted-foreground mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium">{label}</p>
        <p className="text-muted-foreground text-[11px]">{hint}</p>
      </div>
    </div>
  )
}
