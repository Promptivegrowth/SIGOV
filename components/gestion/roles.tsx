'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Users, HardHat, Search, Eye, Plus, Pencil, Download, UserPlus, CheckCircle2, Upload, Lock, Save, Info, Clock, User, Calendar, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { cn, fmtDateTime } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { MODULOS_PERMISO, verPorDefecto, nombreModulo, type ModuloPermiso } from '@/lib/permisos'
import { GestionNav, Kpi } from './gestion-nav'
import { nombreRol } from './usuarios'
import { Elegir } from '@/components/ssoma/control-ssoma'

/**
 * «Roles y permisos» (A01/A02). «Ver» decide qué módulos ve cada rol (menú y
 * rutas) y cada acción (crear, editar, importar, asignar, validar, exportar)
 * se enciende o apaga por rol, con motivo y vista previa Antes/Después; todo
 * queda versionado y en la bitácora, y el servidor lo aplica en cada
 * operación (0159). Solo se puede tocar lo que el sistema admite para el rol
 * (permisos_base): lo demás va con candado para no romper la separación de
 * funciones (el Jefe no valida su propio reporte, el Visor no crea).
 */
const ACCIONES = [['crear', Plus, 'Crear'], ['editar', Pencil, 'Editar'], ['importar', Download, 'Importar'], ['asignar', UserPlus, 'Asignar'], ['validar', CheckCircle2, 'Validar'], ['exportar', Upload, 'Exportar']] as const
const ALCANCE: Record<string, string> = {
  supervisor: 'Cuadrillas asignadas', jefe_cuadrilla: 'Su cuadrilla', residente: 'Todo el contrato', ing_seguridad: 'Todo el contrato (SSOMA)',
  visor: 'Solo lo publicado a COVINCA', admin: 'Todo el contrato',
}

export function RolesPermisos() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [rol, setRol] = React.useState('supervisor')
  const [q, setQ] = React.useState('')
  // cambios[módulo][«ver» | acción] = nuevo valor
  const [cambios, setCambios] = React.useState<Record<string, Record<string, boolean>>>({})
  const [motivo, setMotivo] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  const datos = useQuery({
    queryKey: ['permisos', service.id],
    queryFn: async () => {
      const [{ data: p }, { data: c }, { data: m }, { data: cr }] = await Promise.all([
        sb.from('permisos_rol' as any).select('*').eq('service_id', service.id),
        sb.from('permisos_cambios' as any).select('*, profiles:quien(full_name, email)').eq('service_id', service.id).order('cuando', { ascending: false }).limit(1),
        sb.from('service_members').select('role, profile_id, profiles(full_name, email)').eq('service_id', service.id),
        sb.from('crews').select('id, code, name, supervisor_id').eq('service_id', service.id).is('deleted_at', null).order('code'),
      ])
      const { data: b } = await sb.from('permisos_base' as any).select('rol, modulo, accion')
      return { permisos: (p ?? []) as any[], ultimo: ((c ?? []) as any[])[0], miembros: (m ?? []) as any[], crews: (cr ?? []) as any[], base: (b ?? []) as any[] }
    },
  })
  const d = datos.data
  // Alcance editable del Supervisor: sus cuadrillas asignadas (A01/A02 · «Cuadrillas asignadas»)
  const supervisores = (d?.miembros ?? []).filter((m: any) => m.role === 'supervisor')
  const [sup, setSup] = React.useState('')
  const [crewsSel, setCrewsSel] = React.useState<string[] | null>(null)
  React.useEffect(() => { setCambios({}); setMotivo(''); setCrewsSel(null) }, [rol, sup])
  React.useEffect(() => { if (!sup && supervisores[0]) setSup(supervisores[0].profile_id) }, [supervisores, sup])
  const crewsActuales = (d?.crews ?? []).filter((c: any) => c.supervisor_id === sup).map((c: any) => c.id as string)
  const crewsNuevas = crewsSel ?? crewsActuales
  const alcanceCambia = rol === 'supervisor' && crewsSel !== null && (crewsNuevas.length !== crewsActuales.length || crewsNuevas.some((x) => !crewsActuales.includes(x)))
  const codigo = (id: string) => (d?.crews ?? []).find((c: any) => c.id === id)?.code ?? id
  const otroSupervisor = (id: string) => {
    const c = (d?.crews ?? []).find((x: any) => x.id === id)
    return c?.supervisor_id && c.supervisor_id !== sup ? supervisores.find((m: any) => m.profile_id === c.supervisor_id)?.profiles?.full_name ?? 'otro supervisor' : null
  }
  const baseDe = (r: string, m: string) => (d?.base ?? []).filter((x: any) => x.rol === r && x.modulo === m).map((x: any) => x.accion as string)
  const fila = (r: string, m: string) => (d?.permisos ?? []).find((x) => x.rol === r && x.modulo === m)
  const verDe = (r: string, m: ModuloPermiso) => { const f = fila(r, m); return f && f.ver != null ? !!f.ver : verPorDefecto(r, m, baseDe(r, m)) }
  const accDe = (r: string, m: string, k: string) => baseDe(r, m).includes(k) && fila(r, m)?.acciones?.[k] !== false
  const verActual = (m: ModuloPermiso) => verDe(rol, m)
  const accActual = (m: ModuloPermiso, k: string) => accDe(rol, m, k)
  const ver = (m: ModuloPermiso) => (cambios[m]?.ver ?? verActual(m))
  const acc = (m: ModuloPermiso, k: string) => (cambios[m]?.[k] ?? accActual(m, k))
  const cambiar = (m: ModuloPermiso, k: string, v: boolean) => setCambios({ ...cambios, [m]: { ...(cambios[m] ?? {}), [k]: v } })
  // Lo que de verdad cambia, en orden de la matriz
  const diff = MODULOS_PERMISO.flatMap((m) => ['ver', ...ACCIONES.map(([k]) => k)].flatMap((k) => {
    const nuevo = cambios[m.k]?.[k]
    const antes = k === 'ver' ? verActual(m.k) : accActual(m.k, k)
    return nuevo === undefined || nuevo === antes ? [] : [{ m: m.k as ModuloPermiso, k, antes, nuevo }]
  }))
  const etiqueta = (k: string) => k === 'ver' ? 'Ver' : ACCIONES.find(([x]) => x === k)?.[2] ?? k
  // Avisos de impacto antes de guardar
  const avisos = diff.filter((c) => !c.nuevo).flatMap((c) => {
    const out: string[] = []
    if (rol === 'jefe_cuadrilla' && ['reporte_diario', 'ssoma', 'pci'].includes(c.m))
      out.push(`${nombreModulo(c.m)} – ${etiqueta(c.k)}: la app de campo dejará de poder enviarlo; lo que esté en cola quedará con error de sincronización hasta reactivarlo.`)
    if (c.k !== 'ver') {
      const otros = ['supervisor', 'residente', 'jefe_cuadrilla', 'ing_seguridad', 'visor'].filter((r) => r !== rol && verDe(r, c.m) && accDe(r, c.m, c.k))
      if (!otros.length) out.push(`${nombreModulo(c.m)} – ${etiqueta(c.k)}: ningún otro rol lo tiene; solo lo podrá hacer el Administrador.`)
    } else out.push(`${nombreModulo(c.m)} – Ver apagado: el rol tampoco podrá registrar nada en el módulo.`)
    return out
  })
  const guardar = async () => {
    setGuardando(true)
    if (diff.length) {
      const pCambios: Record<string, Record<string, boolean>> = {}
      for (const c of diff) pCambios[c.m] = { ...(pCambios[c.m] ?? {}), [c.k]: c.nuevo }
      const { error } = await sb.rpc('permisos_guardar' as any, { p_service: service.id, p_rol: rol, p_cambios: pCambios, p_motivo: motivo } as any)
      if (error) { setGuardando(false); return toast.error(mensajeAmigable(error)) }
    }
    if (alcanceCambia) {
      const { error } = await sb.rpc('alcance_supervisor_guardar' as any, { p_service: service.id, p_supervisor: sup, p_crews: crewsNuevas, p_motivo: motivo } as any)
      if (error) { setGuardando(false); return toast.error(mensajeAmigable(error)) }
    }
    setGuardando(false)
    toast.success('Cambios guardados', { description: alcanceCambia ? 'El alcance del supervisor se aplica en su próxima consulta.' : 'El servidor ya los aplica; el menú del rol se actualiza al recargar su sesión.' })
    setCambios({}); setMotivo(''); setCrewsSel(null); qc.invalidateQueries({ queryKey: ['permisos'] }); qc.invalidateQueries({ queryKey: ['permisos-ver'] }); qc.invalidateQueries({ queryKey: ['mis-permisos'] })
  }
  const modulos = MODULOS_PERMISO.filter((m) => !q || m.t.toLowerCase().includes(q.toLowerCase()))
  const editable = rol !== 'admin'

  return (
    <>
      <PageHeader title="Roles y permisos" description="Define y gestiona los permisos por rol, módulos y acciones del sistema." />
      <PageBody className="space-y-4">
        <GestionNav activo="/gestion/roles" />
        <div className="grid grid-cols-3 gap-3">
          <Kpi icono={ShieldCheck} valor={6} etiqueta="Roles" tono="azul" />
          <Kpi icono={Users} valor={d?.miembros.length} etiqueta="Cuentas" tono="verde" />
          <Kpi icono={HardHat} valor={d?.crews.length} etiqueta="Cuadrillas" tono="ambar" />
        </div>
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <Elegir etiqueta="Rol:" valor={rol} cambiar={(v) => setRol(v || rol)} opciones={['supervisor', 'residente', 'jefe_cuadrilla', 'ing_seguridad', 'visor', 'admin'].map((r) => [r, nombreRol(r)])} />
            <div className="relative min-w-64 flex-1"><Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar módulo (p. ej. Programación, PCI...)" className="pl-8" /></div>
            <p className="text-[12.5px]"><span className="text-muted-foreground">Alcance:</span> <strong>{ALCANCE[rol]}</strong></p>
          </CardContent>
        </Card>
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <Card className="min-w-0">
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-[12.5px]">
                <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>
                  <th className="px-3 py-2 text-left font-medium">Módulo</th>
                  <th className="px-2 text-center font-medium"><Eye className="mx-auto size-3.5" />Ver</th>
                  {ACCIONES.map(([k, I, t]) => <th key={k} className="px-2 text-center font-medium"><I className="mx-auto size-3.5" />{t}</th>)}
                </tr></thead>
                <tbody>
                  {modulos.map((m) => (
                    <tr key={m.k} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">{m.t}</td>
                      <td className="px-2 text-center"><Toggle on={ver(m.k)} disabled={!editable} cambiado={cambios[m.k]?.ver !== undefined && cambios[m.k].ver !== verActual(m.k)} onChange={(v) => cambiar(m.k, 'ver', v)} etiqueta={`${m.t} – Ver`} /></td>
                      {ACCIONES.map(([k, , t]) => {
                        const disponible = baseDe(rol, m.k).includes(k)
                        if (!disponible) return <td key={k} className="px-2 text-center" title="No disponible para este rol (separación de funciones)"><Lock className="text-muted-foreground/50 mx-auto size-3" /></td>
                        return <td key={k} className="px-2 text-center"><Toggle on={ver(m.k) && acc(m.k, k)} disabled={!editable || !ver(m.k)} cambiado={cambios[m.k]?.[k] !== undefined && cambios[m.k][k] !== accActual(m.k, k)} onChange={(v) => cambiar(m.k, k, v)} etiqueta={`${m.t} – ${t}`} /></td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-muted-foreground flex flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-[11.5px]">
                <span className="flex items-center gap-1"><Toggle on /> Permiso activado</span><span className="flex items-center gap-1"><Toggle on={false} /> Desactivado</span>
                <span className="flex items-center gap-1"><Lock className="size-3" /> No disponible para el rol (separación de funciones)</span>
                <span className="flex items-center gap-1"><span className="ring-warning inline-block size-3 rounded-full ring-2" /> Cambio sin guardar</span>
                <span className="flex items-center gap-1"><Info className="size-3" /> Los permisos se aplican según el alcance del rol.</span></p>
            </CardContent>
          </Card>
          <Card className="h-fit">
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Alcance y cambios</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-[12.5px]">
              <p><HardHat className="mr-1 inline size-3.5" /><strong>{ALCANCE[rol]}</strong></p>
              {rol === 'supervisor' && (
                <div className="space-y-1.5">
                  <select value={sup} onChange={(e) => setSup(e.target.value)} className="bg-card h-9 w-full rounded-md border border-border px-2">
                    {supervisores.map((m: any) => <option key={m.profile_id} value={m.profile_id}>{m.profiles?.full_name ?? m.profile_id}</option>)}
                  </select>
                  <div className="flex flex-wrap gap-1.5 rounded-md border border-border p-2">
                    {crewsNuevas.map((id) => (
                      <span key={id} className="bg-info/10 text-info flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold">{codigo(id)}
                        <button aria-label={`Quitar ${codigo(id)}`} onClick={() => setCrewsSel(crewsNuevas.filter((x) => x !== id))}>×</button></span>
                    ))}
                    <select value="" onChange={(e) => e.target.value && setCrewsSel([...crewsNuevas, e.target.value])} className="min-w-28 flex-1 bg-transparent text-[12px] outline-none">
                      <option value="">+ Agregar cuadrilla</option>
                      {(d?.crews ?? []).filter((c: any) => !crewsNuevas.includes(c.id)).map((c: any) => <option key={c.id} value={c.id}>{c.code} · {c.name}{otroSupervisor(c.id) ? ` (hoy: ${otroSupervisor(c.id)})` : ''}</option>)}
                    </select>
                  </div>
                  <p className="text-muted-foreground text-[11.5px]">Una cuadrilla tiene un solo supervisor: al agregarla aquí deja de estar con el anterior.</p>
                </div>
              )}
              <label className="block space-y-1"><span className="font-medium">Motivo del cambio <span className="text-destructive">*</span></span>
                <Textarea rows={3} maxLength={250} value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={!editable} placeholder="Por qué cambia el acceso del rol" />
                <span className="text-muted-foreground block text-right text-[11px]">{motivo.length} / 250</span></label>
              <p className="font-medium"><Eye className="mr-1 inline size-3.5" />Vista previa de cambios</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                <div className="rounded-lg border border-border"><p className="bg-secondary rounded-t-lg px-2 py-1 font-semibold">Antes (actual)</p>
                  {diff.length === 0 && !alcanceCambia ? <p className="text-muted-foreground p-2">Sin cambios</p> : diff.map((c) => <p key={c.m + c.k} className="flex items-center justify-between gap-1 p-2">{nombreModulo(c.m)} – {etiqueta(c.k)} <Toggle on={c.antes} /></p>)}
                  {alcanceCambia && <p className="p-2">Cuadrillas: {crewsActuales.map(codigo).join(', ') || 'ninguna'}</p>}</div>
                <span className="pt-6">→</span>
                <div className="border-success/40 rounded-lg border"><p className="bg-success/10 text-success rounded-t-lg px-2 py-1 font-semibold">Después (nuevo)</p>
                  {diff.length === 0 && !alcanceCambia ? <p className="text-muted-foreground p-2">Sin cambios</p> : diff.map((c) => <p key={c.m + c.k} className="flex items-center justify-between gap-1 p-2">{nombreModulo(c.m)} – {etiqueta(c.k)} <Toggle on={c.nuevo} /></p>)}
                  {alcanceCambia && <p className="text-success p-2">Cuadrillas: {crewsNuevas.map(codigo).join(', ') || 'ninguna'}</p>}</div>
              </div>
              {avisos.length > 0 && (
                <ul className="bg-warning/10 border-warning/30 space-y-1 rounded-lg border p-2 text-[12px]">
                  {avisos.map((a) => <li key={a} className="flex gap-1.5"><Info className="text-warning mt-0.5 size-3.5 shrink-0" />{a}</li>)}
                </ul>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setCambios({}); setMotivo(''); setCrewsSel(null) }}>Cancelar</Button>
                <Button onClick={guardar} loading={guardando} disabled={!editable || (!diff.length && !alcanceCambia) || !motivo.trim()}><Save className="size-4" />Guardar cambios</Button>
              </div>
              {!editable && <p className="text-muted-foreground">Los permisos del Administrador no se recortan desde aquí.</p>}
            </CardContent>
          </Card>
        </div>
        <Card><CardContent className="flex flex-wrap items-center gap-4 p-3 text-[12px]">
          <span className="flex items-center gap-1.5"><Clock className="size-3.5" /><strong>Último cambio (auditoría)</strong></span>
          <span className="flex items-center gap-1.5"><User className="size-3.5" />Actor: {d?.ultimo?.profiles?.full_name ?? '—'}</span>
          <span className="flex items-center gap-1.5"><Calendar className="size-3.5" />Fecha: {d?.ultimo ? fmtDateTime(d.ultimo.cuando) : '—'}</span>
          <span className="flex items-center gap-1.5"><Layers className="size-3.5" />Versión: {d?.ultimo ? `v${d.ultimo.version}` : '—'}{d?.ultimo ? ` · ${nombreRol(d.ultimo.rol)} · ${d.ultimo.motivo}` : ''}</span>
          <span className="bg-success/10 text-success rounded-md px-2 py-1">✓ Permisos verificados en servidor. No auto-validación.</span>
        </CardContent></Card>
      </PageBody>
    </>
  )
}

function Toggle({ on, disabled, cambiado, etiqueta, onChange }: { on: boolean; disabled?: boolean; cambiado?: boolean; etiqueta?: string; onChange?: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={etiqueta} disabled={disabled} onClick={() => onChange?.(!on)}
      className={cn('relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full transition-colors', on ? 'bg-success' : 'bg-muted-foreground/30', disabled && onChange && 'opacity-50', !disabled && 'cursor-pointer', cambiado && 'ring-warning ring-2 ring-offset-1')}>
      <span className={cn('inline-block size-3.5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  )
}
