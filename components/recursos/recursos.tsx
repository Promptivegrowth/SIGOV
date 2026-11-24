'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Truck, Link2, Wrench, Search, Plus, Pencil, TriangleAlert, Save, CheckCircle2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn, fmtDate, toISODate } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { Kpi } from '@/components/gestion/gestion-nav'
import { Elegir } from '@/components/ssoma/control-ssoma'
import { EquiposOperativos } from './equipos'
import { VehiculosTab, AsignacionesTab } from './vehiculos'
import { useSearchParams } from 'next/navigation'

/**
 * «Recursos operativos» (ADMIN_Recursos_*): vehículos (alta y edición con
 * sus vencimientos), asignaciones a cuadrilla con control de solapes (una
 * asignación en conflicto no se guarda) y equipos. Cada cambio queda en la
 * auditoría con su motivo.
 */
type Tab = 'vehiculos' | 'asignaciones' | 'equipos'
const ESTADO_V: Record<string, string> = { operativo: 'bg-success/12 text-success', taller: 'bg-warning/15 text-warning', inoperativo: 'bg-destructive/12 text-destructive', dado_de_baja: 'bg-secondary text-muted-foreground' }

export function RecursosOperativos() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const sp = useSearchParams()
  const [tab, setTab] = React.useState<Tab>(() => (['vehiculos', 'asignaciones', 'equipos'].includes(sp.get('tab') ?? '') ? sp.get('tab') as Tab : 'vehiculos'))
  const [q, setQ] = React.useState('')
  const [editar, setEditar] = React.useState<any | null>(null)
  const [asignar, setAsignar] = React.useState<any | null>(null)
  const d = useQuery({
    queryKey: ['recursos', service.id],
    queryFn: async () => {
      const [{ data: v }, { data: a }, { data: e }, { data: c }] = await Promise.all([
        sb.from('vehicles').select('*').eq('service_id', service.id).is('deleted_at', null).order('code'),
        sb.from('crew_vehicle_assignments').select('*, vehicles(code, plate), crews(name, code)').eq('service_id', service.id).order('start_on', { ascending: false }).limit(200),
        sb.from('safety_equipment').select('*, crews(name)').eq('service_id', service.id).is('deleted_at', null).order('code'),
        sb.from('crews').select('id, name, code').eq('service_id', service.id).is('deleted_at', null).order('code'),
      ])
      return { v: (v ?? []) as any[], a: (a ?? []) as any[], e: (e ?? []) as any[], c: (c ?? []) as any[] }
    },
  })
  const x = d.data
  const hoy = toISODate(new Date())
  const vencido = (v: any) => [v.soat_expires_on, v.inspection_expires_on, v.policy_expires_on].some((f) => f && f < hoy)
  const refrescar = () => qc.invalidateQueries({ queryKey: ['recursos'] })
  return (
    <>
      <PageHeader title="Recursos operativos" description="Gestión de vehículos, equipos y asignaciones operativas · Uso interno SERVICON" />
      <PageBody className="space-y-4">
        <div className="bg-secondary inline-flex rounded-lg p-1">
          {([['vehiculos', 'Vehículos', Truck], ['equipos', 'Equipos', Wrench], ['asignaciones', 'Asignaciones', Link2]] as const).map(([k, t, I]) => (
            <button key={k} onClick={() => setTab(k)} className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}><I className="size-3.5" />{t}</button>
          ))}
        </div>
        {tab === 'vehiculos' && x && <VehiculosTab v={x.v} a={x.a} c={x.c} onEditar={setEditar} onAsignar={setAsignar} />}
        {tab === 'equipos' && <EquiposOperativos />}
        {tab === 'asignaciones' && x && <AsignacionesTab a={x.a} c={x.c} onNueva={() => setAsignar({})} />}
      </PageBody>
      {editar && <EditarVehiculo v={editar} cerrar={() => setEditar(null)} alGuardar={() => { setEditar(null); refrescar() }} />}
      {asignar && x && <AsignarVehiculo inicial={asignar} vehiculos={x.v} cuadrillas={x.c} cerrar={() => setAsignar(null)} alGuardar={() => { setAsignar(null); refrescar() }} />}
    </>
  )
}

function EditarVehiculo({ v, cerrar, alGuardar }: { v: any; cerrar: () => void; alGuardar: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [f, setF] = React.useState({ code: v.code ?? '', plate: v.plate ?? '', kind: v.kind ?? 'camioneta', status: v.status ?? 'operativo', soat: v.soat_expires_on ?? '', rev: v.inspection_expires_on ?? '', pol: v.policy_expires_on ?? '', next: v.next_service_on ?? '' })
  const guardar = async () => {
    const fila: any = { code: f.code || null, plate: f.plate.trim().toUpperCase(), kind: f.kind, status: f.status, soat_expires_on: f.soat || null, inspection_expires_on: f.rev || null, policy_expires_on: f.pol || null, next_service_on: f.next || null }
    const { error } = v.id ? await sb.from('vehicles').update(fila).eq('id', v.id) : await sb.from('vehicles').insert({ ...fila, service_id: service.id })
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(v.id ? 'Vehículo actualizado' : 'Vehículo registrado'); alGuardar()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{v.id ? 'Editar vehículo' : 'Nuevo vehículo'}</DialogTitle><DialogDescription>Las fechas de SOAT, revisión técnica y póliza alimentan Vencimientos y los documentos SSOMA.</DialogDescription></DialogHeader>
        <div className="space-y-2 text-[13px]">
          <div className="grid grid-cols-2 gap-2"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="Código (V-018)" /><Input value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} placeholder="Placa" /></div>
          <div className="grid grid-cols-2 gap-2">
            <Elegir etiqueta="Tipo" valor={f.kind} cambiar={(x) => setF({ ...f, kind: x || f.kind })} opciones={[['camioneta', 'Camioneta'], ['volquete', 'Volquete'], ['cisterna', 'Cisterna'], ['cargador', 'Cargador'], ['retroexcavadora', 'Retroexcavadora'], ['rodillo', 'Rodillo'], ['motoniveladora', 'Motoniveladora'], ['moto', 'Moto'], ['otro', 'Otro']]} />
            <Elegir etiqueta="Estado" valor={f.status} cambiar={(x) => setF({ ...f, status: x || f.status })} opciones={[['operativo', 'Operativo'], ['taller', 'Taller'], ['inoperativo', 'Inoperativo'], ['dado_de_baja', 'Dado de baja']]} />
          </div>
          {[['soat', 'SOAT vence'], ['rev', 'Revisión técnica vence'], ['pol', 'Póliza vence'], ['next', 'Próximo mantenimiento']].map(([k, t]) => (
            <label key={k} className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{t}</span><Input type="date" value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="h-9 w-44" /></label>
          ))}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button><Button onClick={guardar} disabled={!f.plate.trim()}><Save className="size-4" />Guardar</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AsignarVehiculo({ inicial, vehiculos, cuadrillas, cerrar, alGuardar }: { inicial: any; vehiculos: any[]; cuadrillas: any[]; cerrar: () => void; alGuardar: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [f, setF] = React.useState({ vehicle: inicial.vehicle_id ?? '', crew: '', kind: 'titular', desde: toISODate(new Date()), hasta: '', motivo: '', responsable: '' })
  const personas = useQuery({ queryKey: ['asig-personas', f.crew], enabled: !!f.crew,
    queryFn: async () => ((await sb.from('crew_members').select('profile_id, full_name').eq('crew_id', f.crew).eq('is_active', true).not('profile_id', 'is', null)).data ?? []) as any[] })
  const ver = useQuery({
    queryKey: ['asig-verif', f.vehicle, f.crew, f.desde, f.hasta],
    enabled: !!f.vehicle && !!f.crew && !!f.desde,
    queryFn: async () => ((await sb.rpc('asignacion_verificar' as any, { p_vehicle: f.vehicle, p_crew: f.crew, p_desde: f.desde, p_hasta: f.hasta || null } as any)).data as any),
  })
  const conflictos = (ver.data?.conflictos ?? []) as any[]
  const guardar = async () => {
    const { error } = await sb.rpc('asignacion_guardar' as any, { p_vehicle: f.vehicle, p_crew: f.crew, p_kind: f.kind, p_desde: f.desde, p_hasta: f.hasta || null, p_motivo: f.motivo } as any)
    if (error) return toast.error(mensajeAmigable(error))
    // Responsable de la asignación (guía: obligatorio)
    await sb.from('crew_vehicle_assignments').update({ responsable_id: f.responsable } as any).eq('vehicle_id', f.vehicle).eq('crew_id', f.crew).eq('start_on', f.desde)
    toast.success('Asignación registrada'); alGuardar()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Asignación de vehículo</DialogTitle><DialogDescription>Se verifica la disponibilidad: una asignación en conflicto no se guarda.</DialogDescription></DialogHeader>
        <div className="space-y-2 text-[13px]">
          <Elegir etiqueta="Vehículo" valor={f.vehicle} cambiar={(x) => setF({ ...f, vehicle: x })} todos="Elegir" opciones={vehiculos.map((v) => [v.id, `${v.code ?? ''} ${v.plate}`])} />
          <Elegir etiqueta="Cuadrilla" valor={f.crew} cambiar={(x) => setF({ ...f, crew: x })} todos="Elegir" opciones={cuadrillas.map((c) => [c.id, c.name])} />
          <Elegir etiqueta="Tipo" valor={f.kind} cambiar={(x) => setF({ ...f, kind: x || f.kind })} opciones={[['titular', 'Titular'], ['reemplazo', 'Reemplazo'], ['temporal', 'Temporal']]} />
          <Elegir etiqueta="Responsable *" valor={f.responsable} cambiar={(x) => setF({ ...f, responsable: x })} todos={f.crew ? 'Elegir' : 'Elige primero la cuadrilla'}
            opciones={(personas.data ?? []).map((p: any) => [p.profile_id, p.full_name])} />
          <div className="grid grid-cols-2 gap-2"><label><span className="text-muted-foreground block text-[12px]">Desde *</span><Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></label><label><span className="text-muted-foreground block text-[12px]">Hasta (vacío = hasta finalizarla)</span><Input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></label></div>
          {conflictos.length > 0 && (
            <p className="bg-destructive/10 text-destructive rounded-md px-2.5 py-2 text-[12.5px] font-semibold"><TriangleAlert className="mr-1 inline size-3.5" />Asignación en conflicto: {conflictos.map((c) => `${c.cuadrilla} (${fmtDate(c.desde)} – ${c.hasta ? fmtDate(c.hasta) : 'vigente'})`).join(', ')}. Finaliza esa asignación o cambia las fechas.</p>
          )}
          {ver.data?.vehiculo && ver.data.vehiculo.apto === false && (
            <p className="bg-destructive/10 text-destructive rounded-md px-2.5 py-2 text-[12.5px] font-semibold"><TriangleAlert className="mr-1 inline size-3.5" />No apto para circular: {ver.data.vehiculo.motivo_no_apto}. Operativo mecánico no equivale a apto; renueva el documento antes de asignarlo.</p>
          )}
          {ver.data && conflictos.length === 0 && ver.data.vehiculo?.apto !== false && <p className="bg-success/10 text-success rounded-md px-2.5 py-2 text-[12.5px]">Disponible en esas fechas. La cuadrilla tiene {ver.data.de_la_cuadrilla} vehículo(s) vigente(s) (máximo 2).</p>}
          <Textarea rows={2} value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} placeholder="Motivo de la asignación (obligatorio)" />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={cerrar}>Cancelar</Button><Button onClick={guardar} disabled={!f.vehicle || !f.crew || !f.responsable || !f.motivo.trim() || conflictos.length > 0 || ver.data?.vehiculo?.apto === false}><Save className="size-4" />Guardar asignación</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
