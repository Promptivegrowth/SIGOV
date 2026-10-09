'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleX, Download } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Field } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/misc'
import { descargarExcel } from '@/lib/reports'
import { mensajeAmigable } from '@/lib/errores'
import { fmtDate, fmtNumber } from '@/lib/utils'

const TIPO: Record<string, { label: string; variant: any }> = {
  titular: { label: 'Titular', variant: 'info' },
  reemplazo: { label: 'Reemplazo', variant: 'warning' },
  temporal: { label: 'Temporal', variant: 'outline' },
}
const MOTIVO: Record<string, string> = {
  mantenimiento: 'Mantenimiento', averia: 'Avería', reparacion: 'Reparación', cambio_temporal: 'Cambio temporal',
  vuelve_titular: 'Volvió el titular', 'alta temporal': 'Alta temporal',
}
const motivo = (m: string | null) => (m ? MOTIVO[m] ?? m : '—')

const hoyLima = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())

/**
 * Qué vehículo usó cada cuadrilla, qué días, con qué kilometraje y por qué
 * (OBS-73), y los vehículos dados de alta en campo que esperan validación
 * (OBS-72).
 */
export function UsoDeVehiculos() {
  const { service, can } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [desde, setDesde] = React.useState(() => hoyLima().slice(0, 7) + '-01')
  const [hasta, setHasta] = React.useState(hoyLima)
  const [cuadrilla, setCuadrilla] = React.useState('')
  const [placa, setPlaca] = React.useState('')

  const uso = useQuery({
    queryKey: ['uso-vehiculos', service.id, desde, hasta],
    queryFn: async () => {
      // Las asignaciones que tocan el periodo: empezaron antes de que termine y no cerraron antes de que empiece
      const { data, error } = await sb.from('v_uso_de_vehiculos' as any).select('*')
        .eq('service_id', service.id).lte('start_on', hasta)
        .or(`end_on.is.null,end_on.gte.${desde}`)
        .order('start_on', { ascending: false })
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const pendientes = useQuery({
    queryKey: ['vehiculos-por-validar', service.id],
    queryFn: async () => {
      const { data, error } = await sb.from('v_vehicles').select('id, plate, kind, brand, model, crew_name, odometer_km')
        .eq('service_id', service.id).eq('validation_status' as any, 'pendiente')
      if (error) throw error
      return (data ?? []) as any[]
    },
  })

  const filas = (uso.data ?? []).filter((f) =>
    (!cuadrilla || `${f.crew_code} ${f.crew_name}`.toLowerCase().includes(cuadrilla.toLowerCase())) &&
    (!placa || String(f.plate).toLowerCase().includes(placa.toLowerCase())))

  const validar = async (id: string, aceptar: boolean) => {
    const { error } = await sb.rpc('validar_vehiculo' as any, { p_vehiculo: id, p_aceptar: aceptar } as any)
    if (error) { toast.error(mensajeAmigable(error)); return }
    toast.success(aceptar ? 'Vehículo incorporado a la flota' : 'Vehículo rechazado')
    qc.invalidateQueries({ queryKey: ['vehiculos-por-validar'] })
    qc.invalidateQueries({ queryKey: ['uso-vehiculos'] })
  }

  const exportar = () => descargarExcel(`USO_DE_VEHICULOS_${desde}_a_${hasta}`, {
    titulo: 'Uso de vehículos por cuadrilla', servicio: service.name, cliente: service.client_name,
    contrato: service.contract_code, periodo: `${fmtDate(desde)} al ${fmtDate(hasta)}`, generadoPor: '',
  } as any, [{
    name: 'Uso',
    columns: [
      { header: 'Cuadrilla', key: 'crew_code', width: 12 }, { header: 'Placa', key: 'plate', width: 12 },
      { header: 'Tipo', key: 'tipo', width: 12 }, { header: 'Reemplaza a', key: 'reemplaza_a', width: 12 },
      { header: 'Desde', key: 'start_on', width: 12 }, { header: 'Hasta', key: 'end_on', width: 12 },
      { header: 'Días', key: 'dias', width: 8 }, { header: 'Km inicial', key: 'km_inicial', width: 12 },
      { header: 'Km final', key: 'km_final', width: 12 }, { header: 'Recorrido', key: 'recorrido', width: 12 },
      { header: 'Motivo', key: 'motivo', width: 20 }, { header: 'Cierre', key: 'cierre', width: 20 },
      { header: 'Checklists', key: 'checklists', width: 10 },
    ],
    rows: filas.map((f) => ({
      ...f, tipo: TIPO[f.assignment_kind]?.label ?? f.assignment_kind, end_on: f.end_on ?? 'vigente',
      dias: Number(f.dias), km_inicial: f.km_inicial != null ? Number(f.km_inicial) : null,
      km_final: f.km_final != null ? Number(f.km_final) : null,
      recorrido: f.km_final != null && f.km_inicial != null ? Number(f.km_final) - Number(f.km_inicial) : null,
      motivo: motivo(f.reason), cierre: motivo(f.end_reason), checklists: Number(f.checklists),
    })),
  }])

  return (
    <div className="space-y-4">
      {(pendientes.data ?? []).length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="space-y-2 p-4">
            <p className="text-[13px] font-semibold">Vehículos dados de alta en campo, por validar</p>
            {pendientes.data!.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-[12.5px]">
                <span className="font-semibold">{v.plate}</span>
                <span className="text-muted-foreground">{[v.kind, v.brand, v.model].filter(Boolean).join(' · ')}</span>
                <span className="text-muted-foreground">{v.crew_name ?? 'Sin cuadrilla'}</span>
                {v.odometer_km != null && <span className="text-muted-foreground">{fmtNumber(v.odometer_km)} km</span>}
                {can.manage && (
                  <span className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => validar(v.id, false)}><CircleX className="size-4" />Rechazar</Button>
                    <Button size="sm" variant="success" onClick={() => validar(v.id, true)}><CircleCheck className="size-4" />Incorporar</Button>
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Desde" className="w-40"><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
        <Field label="Hasta" className="w-40"><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></Field>
        <Field label="Cuadrilla" className="w-44"><Input value={cuadrilla} onChange={(e) => setCuadrilla(e.target.value)} placeholder="CUA-01" /></Field>
        <Field label="Placa" className="w-36"><Input value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="V4A-712" /></Field>
        <div className="flex gap-1">
          {[['Hoy', 0], ['Semana', 6], ['Mes', 29]].map(([t, d]) => (
            <Button key={t as string} variant="ghost" size="sm" onClick={() => {
              const h = hoyLima(); setHasta(h)
              setDesde(new Date(new Date(h + 'T12:00:00').getTime() - (d as number) * 86400000).toISOString().slice(0, 10))
            }}>{t}</Button>
          ))}
        </div>
        <Button variant="outline" className="ml-auto" onClick={exportar} disabled={!filas.length}>
          <Download className="size-4" />Excel
        </Button>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {filas.length === 0 ? (
            <EmptyState title="Sin uso de vehículos en el periodo" />
          ) : (
            <table className="w-full min-w-[900px] text-[12.5px]">
              <thead className="text-muted-foreground text-left text-[11px]">
                <tr>
                  {['Cuadrilla', 'Placa', 'Asignación', 'Desde', 'Hasta', 'Días', 'Km inicial', 'Km final', 'Motivo', 'Checklists'].map((h) =>
                    <th key={h} className="px-3 py-2">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-t border-border">
                    <td className="px-3 py-2"><span className="font-medium">{f.crew_code}</span></td>
                    <td className="px-3 py-2 font-semibold">{f.plate}{f.is_temporary && <Badge variant="outline" className="ml-1.5 text-[10px]">temporal</Badge>}</td>
                    <td className="px-3 py-2">
                      <Badge variant={TIPO[f.assignment_kind]?.variant}>{TIPO[f.assignment_kind]?.label ?? f.assignment_kind}</Badge>
                      {f.reemplaza_a && <span className="text-muted-foreground block text-[11px]">de {f.reemplaza_a}</span>}
                    </td>
                    <td className="px-3 py-2">{fmtDate(f.start_on)}</td>
                    <td className="px-3 py-2">{f.end_on ? fmtDate(f.end_on) : <span className="text-success">vigente</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{f.dias}</td>
                    <td className="px-3 py-2 tabular-nums">{f.km_inicial != null ? fmtNumber(f.km_inicial) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{f.km_final != null ? fmtNumber(f.km_final) : '—'}</td>
                    <td className="px-3 py-2">{motivo(f.reason)}{f.end_reason && <span className="text-muted-foreground block text-[11px]">cierre: {motivo(f.end_reason)}</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{f.checklists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
