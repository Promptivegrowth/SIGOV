'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, UserCheck, Clock, Hourglass, Search, Plus, Eye, Pencil, KeyRound, Unlock, HardHat, Briefcase, Shield, Monitor, Settings2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { SkeletonList } from '@/components/ui/skeleton'
import { ROLES, type Role } from '@/lib/constants'
import { usuarioDeCorreo, correoDeUsuario, CLAVE_MINIMA } from '@/lib/usuario'
import { cn, fmtDateTime, fmtNumber } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { GestionNav, Kpi } from './gestion-nav'
import { Elegir } from '@/components/ssoma/control-ssoma'

/**
 * «Usuarios» (A02): KPIs (total, activos, inactivos, pendientes), búsqueda,
 * filtros por estado, rol y cuadrilla, y por cada cuenta: ver, editar,
 * restablecer contraseña y desbloquear. «Pendiente» = cuenta creada que aún
 * no ingresó. Las cuentas las crea el servidor (/api/usuarios).
 * ROL01 «Usuarios y acceso»: el ámbito (cobertura) de cada cuenta se ve en
 * la tabla y se edita desde aquí (cuadrillas del Supervisor, cuadrilla del
 * Jefe) con motivo; la ficha trae el historial de cambios de la bitácora.
 */
const ICONO_ROL: Record<string, any> = { supervisor: HardHat, jefe_cuadrilla: Users, residente: Briefcase, ing_seguridad: Shield, visor: Monitor, admin: Settings2 }
const ESTADO: Record<string, { t: string; c: string }> = {
  activo: { t: 'Activo', c: 'bg-success/12 text-success' }, inactivo: { t: 'Inactivo', c: 'bg-warning/15 text-warning' },
  pendiente: { t: 'Pendiente', c: 'bg-warning/15 text-warning' }, bloqueado: { t: 'Bloqueado', c: 'bg-destructive/12 text-destructive' },
}
export const nombreRol = (r: string) => (ROLES as any)[r]?.label ?? r

export function GestionUsuarios() {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [f, setF] = React.useState({ q: '', estado: '', rol: '', cuadrilla: '' })
  const [ver, setVer] = React.useState<any | null>(null)
  const [editar, setEditar] = React.useState<any | null>(null)
  const [crear, setCrear] = React.useState(false)
  const [ambito, setAmbito] = React.useState<any | null>(null)
  const q = useQuery({
    queryKey: ['gestion-usuarios', service.id],
    queryFn: async () => { const { data, error } = await sb.rpc('usuarios_contrato' as any, { p_service: service.id } as any); if (error) throw error; return (data ?? []) as any[] },
  })
  const todos = q.data ?? []
  const cuadrillas = [...new Set(todos.flatMap((u) => String(u.cuadrilla ?? '').split(', ').filter(Boolean)))]
  const filas = todos.filter((u) => (!f.estado || u.estado === f.estado) && (!f.rol || u.rol === f.rol)
    && (!f.cuadrilla || String(u.cuadrilla ?? '').includes(f.cuadrilla))
    && (!f.q || `${u.nombre} ${usuarioDeCorreo(u.email)} ${u.email}`.toLowerCase().includes(f.q.toLowerCase())))
  const llamar = async (cuerpo: any, ok: string) => {
    const r = await fetch('/api/usuarios', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: service.id, ...cuerpo }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return toast.error(j.error ?? 'No se pudo guardar')
    toast.success(ok); qc.invalidateQueries({ queryKey: ['gestion-usuarios'] })
  }
  const restablecer = (u: any) => {
    const nueva = prompt(`Nueva contraseña para ${u.nombre} (mínimo ${CLAVE_MINIMA} caracteres):`)
    if (!nueva) return
    void llamar({ id: u.id, new_password: nueva }, 'Contraseña restablecida; queda en el historial de accesos')
  }

  return (
    <>
      <PageHeader title="Usuarios" description="Gestión de usuarios y roles del sistema" />
      <PageBody className="space-y-4">
        <GestionNav activo="/gestion/usuarios" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icono={Users} valor={todos.length} etiqueta="Total usuarios" tono="azul" />
          <Kpi icono={UserCheck} valor={todos.filter((u) => u.estado === 'activo').length} etiqueta="Activos" tono="verde" />
          <Kpi icono={Clock} valor={todos.filter((u) => u.estado === 'inactivo' || u.estado === 'bloqueado').length} etiqueta="Inactivos o bloqueados" tono="ambar" />
          <Kpi icono={Hourglass} valor={todos.filter((u) => u.estado === 'pendiente').length} etiqueta="Pendientes (sin primer ingreso)" tono="rojo" />
        </div>
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Buscar por nombre, usuario o correo..." className="pl-8" /></div>
            <Elegir etiqueta="Estado:" valor={f.estado} cambiar={(v) => setF({ ...f, estado: v })} todos="Todos" opciones={Object.entries(ESTADO).map(([k, v]) => [k, v.t])} />
            <Elegir etiqueta="Rol:" valor={f.rol} cambiar={(v) => setF({ ...f, rol: v })} todos="Todos" opciones={Object.keys(ICONO_ROL).map((r) => [r, nombreRol(r)])} />
            <Elegir etiqueta="Cuadrilla/Área:" valor={f.cuadrilla} cambiar={(v) => setF({ ...f, cuadrilla: v })} todos="Todas" opciones={cuadrillas.map((c) => [c, c])} />
            <Button onClick={() => setCrear(true)}><Plus className="size-4" />Crear usuario</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-[14px]">Usuarios registrados</CardTitle>
            <span className="text-muted-foreground text-[12px]">{fmtNumber(filas.length)} usuarios</span></CardHeader>
          <CardContent className="p-0">
            {q.isLoading ? <div className="p-4"><SkeletonList rows={6} /></div> : (
              <ul className="divide-y divide-border">
                {filas.map((u) => {
                  const I = ICONO_ROL[u.rol] ?? Users
                  return (
                    <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[12.5px]">
                      <span className="bg-info/12 text-info grid size-9 place-items-center rounded-full text-[12px] font-bold">{u.nombre.split(' ').map((x: string) => x[0]).slice(0, 2).join('')}</span>
                      <div className="min-w-44 flex-1"><p className="font-semibold">{u.nombre}</p><p className="text-muted-foreground">{usuarioDeCorreo(u.email)}</p></div>
                      <p className="flex min-w-40 items-center gap-1.5 font-semibold"><I className="text-muted-foreground size-3.5" />{nombreRol(u.rol)}</p>
                      <p className="text-muted-foreground flex min-w-44 items-center gap-1.5" title="Ámbito de la cuenta"><MapPin className="size-3.5" />{u.ambito || u.cuadrilla || '—'}</p>
                      <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold', ESTADO[u.estado]?.c)}>● {ESTADO[u.estado]?.t}</span>
                      <span className="flex gap-1">
                        <Button size="icon-sm" variant="outline" aria-label="Ver" onClick={() => setVer(u)}><Eye className="size-3.5" /></Button>
                        <Button size="icon-sm" variant="outline" aria-label="Editar" onClick={() => setEditar(u)} disabled={u.id === profile.id}><Pencil className="size-3.5" /></Button>
                        <Button size="icon-sm" variant="outline" aria-label="Restablecer contraseña" onClick={() => restablecer(u)} disabled={u.id === profile.id}><KeyRound className="size-3.5" /></Button>
                        {u.estado === 'bloqueado' && <Button size="sm" variant="outline" onClick={() => llamar({ id: u.id, desbloquear: true }, 'Usuario desbloqueado')}><Unlock className="size-3.5" />Desbloquear</Button>}
                      </span>
                      {['supervisor', 'jefe_cuadrilla'].includes(u.rol)
                        ? <button className="text-primary min-w-24 text-[12px] font-semibold" onClick={() => setAmbito(u)}>Editar ámbito ›</button>
                        : <button className="text-primary min-w-24 text-[12px] font-semibold" onClick={() => setVer(u)}>Ver perfil ›</button>}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </PageBody>
      {ver && <VerUsuario u={ver} cerrar={() => setVer(null)} />}
      {ambito && <EditarAmbito u={ambito} cerrar={() => setAmbito(null)} alGuardar={() => { setAmbito(null); qc.invalidateQueries({ queryKey: ['gestion-usuarios'] }) }} />}
      {editar && <EditarUsuario u={editar} cerrar={() => setEditar(null)} guardar={(c) => llamar({ id: editar.id, ...c }, 'Usuario actualizado').then(() => setEditar(null))} />}
      {crear && <CrearUsuario cerrar={() => setCrear(false)} alCrear={() => { setCrear(false); qc.invalidateQueries({ queryKey: ['gestion-usuarios'] }) }} />}
    </>
  )
}

function VerUsuario({ u, cerrar }: { u: any; cerrar: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const hist = useQuery({
    queryKey: ['usuario-historial', u.id],
    queryFn: async () => ((await sb.rpc('usuario_historial' as any, { p_service: service.id, p_profile: u.id } as any)).data ?? []) as any[],
  })
  const conRoles = (t: string) => t.replace(/\b(admin|supervisor|residente|jefe_cuadrilla|ing_seguridad|visor)\b/g, (r) => nombreRol(r))
  const acc = useQuery({
    queryKey: ['accesos-de', u.id],
    queryFn: async () => ((await sb.from('accesos' as any).select('*').eq('profile_id', u.id).order('cuando', { ascending: false }).limit(8)).data ?? []) as any[],
  })
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{u.nombre}</DialogTitle><DialogDescription>{usuarioDeCorreo(u.email)} · {nombreRol(u.rol)}</DialogDescription></DialogHeader>
        <div className="space-y-1 text-[13px]">
          {[['Estado', ESTADO[u.estado]?.t], ['Ámbito', u.ambito || '—'], ['Cuadrilla/Área', u.cuadrilla || '—'], ['Cargo', u.cargo || '—'], ['DNI', u.dni || '—'], ['Teléfono', u.telefono || '—'],
            ['Creado', u.creado ? fmtDateTime(u.creado) : '—'], ['Último ingreso', u.ultimo_ingreso ? fmtDateTime(u.ultimo_ingreso) : 'Nunca']].map(([k, v]) => (
            <p key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span>{v}</span></p>
          ))}
          <p className="pt-2 font-semibold">Últimos accesos</p>
          {(acc.data ?? []).length === 0 && <p className="text-muted-foreground">Sin registros.</p>}
          {(acc.data ?? []).map((a) => <p key={a.id} className="text-muted-foreground text-[12px]">{fmtDateTime(a.cuando)} · {a.evento} · {a.dispositivo ?? ''} · {a.ip ?? ''}</p>)}
          <p className="pt-2 font-semibold">Historial de cambios</p>
          {hist.isLoading && <p className="text-muted-foreground">Cargando…</p>}
          {!hist.isLoading && (hist.data ?? []).length === 0 && <p className="text-muted-foreground">Sin cambios registrados.</p>}
          <ul className="max-h-56 space-y-1 overflow-y-auto border-l-2 border-info/40 pl-3">
            {(hist.data ?? []).map((h) => (
              <li key={h.id} className="text-[12px]"><p><strong>{conRoles(h.accion)}</strong></p>
                <p className="text-muted-foreground">{fmtDateTime(h.at)} · por {h.actor}{h.motivo ? ` · ${h.motivo}` : ''} · <Link href={`/auditoria?evento=${h.id}`} className="text-primary underline">{h.codigo}</Link></p></li>
            ))}
          </ul>
          <p className="text-muted-foreground text-[11.5px]">Solo lectura · sale de la bitácora, que no se edita ni se borra.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EditarUsuario({ u, cerrar, guardar }: { u: any; cerrar: () => void; guardar: (c: any) => void }) {
  const [v, setV] = React.useState({ full_name: u.nombre, position: u.cargo ?? '', phone: u.telefono ?? '', dni: u.dni ?? '', role: u.rol as Role, is_active: u.activo })
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar usuario</DialogTitle><DialogDescription>{usuarioDeCorreo(u.email)}. Desactivar corta el acceso; la historia de la persona se conserva.</DialogDescription></DialogHeader>
        <div className="space-y-2 text-[13px]">
          <Input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} placeholder="Nombre completo" />
          <Input value={v.position} onChange={(e) => setV({ ...v, position: e.target.value })} placeholder="Cargo" />
          <div className="grid grid-cols-2 gap-2"><Input value={v.dni} onChange={(e) => setV({ ...v, dni: e.target.value })} placeholder="DNI" />
            <Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="Teléfono" /></div>
          <Elegir etiqueta="Rol" valor={v.role} cambiar={(x) => setV({ ...v, role: (x || v.role) as Role })} opciones={Object.keys(ICONO_ROL).filter((r) => r !== 'admin').map((r) => [r, nombreRol(r)])} />
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.is_active} onChange={(e) => setV({ ...v, is_active: e.target.checked })} />Cuenta activa</label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button><Button onClick={() => guardar(v)}>Guardar cambios</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CrearUsuario({ cerrar, alCrear }: { cerrar: () => void; alCrear: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [v, setV] = React.useState({ usuario: '', full_name: '', role: 'jefe_cuadrilla', crew_id: '', password: '', dni: '', position: '' })
  const [cred, setCred] = React.useState<any>(null)
  const crews = useQuery({ queryKey: ['crews-sel', service.id], queryFn: async () => ((await sb.from('crews').select('id, name').eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? []) as any[] })
  const crear = async () => {
    const r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: service.id, email: correoDeUsuario(v.usuario), full_name: v.full_name, role: v.role, crew_id: v.crew_id || null, password: v.password || undefined, dni: v.dni || null, position: v.position || null }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return toast.error(j.error ?? 'No se pudo crear')
    setCred(j); toast.success('Usuario creado: queda «Pendiente» hasta su primer ingreso')
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) { cerrar(); if (cred) alCrear() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Crear usuario</DialogTitle><DialogDescription>La cuenta queda pendiente hasta su primer ingreso.</DialogDescription></DialogHeader>
        {cred ? (
          <div className="space-y-2 text-[13px]">
            <p>Comparte estas credenciales una sola vez:</p>
            <p className="bg-secondary rounded-md px-3 py-2 font-mono">Usuario: {usuarioDeCorreo(cred.email)}<br />Contraseña: {cred.password}</p>
            <Button className="w-full" onClick={() => { cerrar(); alCrear() }}>Listo</Button>
          </div>
        ) : (
          <div className="space-y-2 text-[13px]">
            <Input value={v.usuario} onChange={(e) => setV({ ...v, usuario: e.target.value.trim().toLowerCase() })} placeholder="Usuario (p. ej. jramos)" />
            <Input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} placeholder="Nombre completo" />
            <div className="grid grid-cols-2 gap-2"><Input value={v.dni} onChange={(e) => setV({ ...v, dni: e.target.value })} placeholder="DNI" />
              <Input value={v.position} onChange={(e) => setV({ ...v, position: e.target.value })} placeholder="Cargo" /></div>
            <Elegir etiqueta="Rol" valor={v.role} cambiar={(x) => setV({ ...v, role: x || v.role })} opciones={Object.keys(ICONO_ROL).filter((r) => r !== 'admin').map((r) => [r, nombreRol(r)])} />
            {v.role === 'jefe_cuadrilla' && <Elegir etiqueta="Cuadrilla" valor={v.crew_id} cambiar={(x) => setV({ ...v, crew_id: x })} todos="Sin cuadrilla" opciones={(crews.data ?? []).map((c) => [c.id, c.name])} />}
            <Input value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} placeholder={`Contraseña (opcional, mín. ${CLAVE_MINIMA}; si no, se genera)`} />
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button>
              <Button onClick={crear} disabled={!v.usuario || !v.full_name}><Plus className="size-4" />Crear usuario</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** «Editar ámbito ›» (ROL01): cuadrillas del Supervisor o cuadrilla del Jefe, con motivo y bitácora. */
function EditarAmbito({ u, cerrar, alGuardar }: { u: any; cerrar: () => void; alGuardar: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const crews = useQuery({
    queryKey: ['crews-ambito', service.id],
    queryFn: async () => ((await sb.from('crews').select('id, code, name, leader_id, supervisor_id').eq('service_id', service.id).is('deleted_at', null).order('code')).data ?? []) as any[],
  })
  const esSup = u.rol === 'supervisor'
  const [sel, setSel] = React.useState<string[]>(esSup ? (u.crews_supervisa ?? []) : u.crew_lider ? [u.crew_lider] : [])
  const [motivo, setMotivo] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  const lista = crews.data ?? []
  const codigo = (id: string) => lista.find((c) => c.id === id)?.code ?? id
  const ocupada = (c: any) => (esSup ? c.supervisor_id && c.supervisor_id !== u.id : c.leader_id && c.leader_id !== u.id)
  const guardar = async () => {
    setGuardando(true)
    const { error } = esSup
      ? await sb.rpc('alcance_supervisor_guardar' as any, { p_service: service.id, p_supervisor: u.id, p_crews: sel, p_motivo: motivo } as any)
      : await sb.rpc('jefe_cuadrilla_asignar' as any, { p_service: service.id, p_jefe: u.id, p_crew: sel[0] ?? null, p_motivo: motivo } as any)
    setGuardando(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Ámbito actualizado', { description: 'Queda en el historial de la cuenta y en la bitácora.' })
    alGuardar()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar ámbito · {u.nombre}</DialogTitle>
          <DialogDescription>{nombreRol(u.rol)} · hoy: {u.ambito || '—'}. {esSup ? 'Una cuadrilla tiene un solo supervisor: al agregarla deja de estar con el anterior.' : 'Una cuadrilla tiene un solo jefe: al asignarla, su jefe anterior queda sin ella.'}</DialogDescription></DialogHeader>
        <div className="space-y-3 text-[13px]">
          {esSup ? (
            <div className="flex flex-wrap gap-1.5 rounded-md border border-border p-2">
              {sel.map((id) => (
                <span key={id} className="bg-info/10 text-info flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold">{codigo(id)}
                  <button aria-label={`Quitar ${codigo(id)}`} onClick={() => setSel(sel.filter((x) => x !== id))}>×</button></span>
              ))}
              <select value="" onChange={(e) => e.target.value && setSel([...sel, e.target.value])} className="min-w-28 flex-1 bg-transparent text-[12px] outline-none">
                <option value="">+ Agregar cuadrilla</option>
                {lista.filter((c) => !sel.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}{ocupada(c) ? ' (tiene otro supervisor)' : ''}</option>)}
              </select>
            </div>
          ) : (
            <select value={sel[0] ?? ''} onChange={(e) => setSel(e.target.value ? [e.target.value] : [])} className="bg-card h-9 w-full rounded-md border border-border px-2">
              <option value="">Sin cuadrilla</option>
              {lista.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}{ocupada(c) ? ' (tiene otro jefe)' : ''}</option>)}
            </select>
          )}
          <label className="block space-y-1"><span className="font-medium">Motivo del cambio <span className="text-destructive">*</span></span>
            <Input maxLength={250} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué cambia la cobertura de la cuenta" /></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button>
            <Button onClick={guardar} loading={guardando} disabled={!motivo.trim()}>Guardar ámbito</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
