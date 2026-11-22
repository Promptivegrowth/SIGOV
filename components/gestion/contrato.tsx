'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Calendar, Lock, History, Save, Info } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { etiquetaPlazo, usePlazosPci } from '@/lib/hooks/use-plazos-pci'
import { fmtDate, fmtDateTime } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Configuración del sistema › Contrato» (ADMIN_SUB_Config_Contrato): datos
 * generales (código, cliente, operador, zona horaria, vigencia), plazos PCI
 * en solo lectura (se cambian por PCI con su versión) y sectores; guardar
 * crea una versión nueva con motivo e historial.
 */
export function ConfigContrato() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const { plazos } = usePlazosPci()
  const q = useQuery({
    queryKey: ['contrato', service.id],
    queryFn: async () => {
      const [{ data: s }, { data: v }, { data: sec }] = await Promise.all([
        sb.from('services').select('*').eq('id', service.id).maybeSingle(),
        sb.from('contrato_versiones' as any).select('*, profiles:quien(full_name)').eq('service_id', service.id).order('version', { ascending: false }),
        sb.from('service_sectors').select('code').eq('service_id', service.id).order('orden'),
      ])
      return { s: s as any, versiones: (v ?? []) as any[], sectores: ((sec ?? []) as any[]).map((x) => x.code) }
    },
  })
  const [f, setF] = React.useState<any>(null)
  const [motivo, setMotivo] = React.useState('')
  React.useEffect(() => {
    const s = q.data?.s
    if (s && !f) setF({ name: s.name ?? '', code: s.code ?? '', client_name: s.client_name ?? '', contract_code: s.contract_code ?? '', starts_on: s.starts_on ?? '', ends_on: s.ends_on ?? '',
      operador: s.settings?.operador ?? 'GRUPO SERVICON V&D E.I.R.L.', zona_horaria: s.settings?.zona_horaria ?? 'America/Lima', description: s.description ?? '' })
  }, [q.data, f])
  const guardar = async () => {
    const { data, error } = await sb.rpc('contrato_guardar' as any, { p_service: service.id, p_datos: f, p_motivo: motivo } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Contrato guardado como versión v${(data as any).version}`); setMotivo(''); qc.invalidateQueries({ queryKey: ['contrato'] })
  }
  if (!f) return null
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[14px]"><FileText className="size-4" />Datos generales del contrato <Badge variant="info">v{q.data?.versiones[0]?.version ?? 1}</Badge></CardTitle></CardHeader>
        <CardContent className="space-y-2.5 text-[12.5px]">
          <div className="grid gap-2 sm:grid-cols-2">
            <label><span className="text-muted-foreground">Código del contrato</span><div className="relative"><Input value={f.code} disabled readOnly className="h-9" /><Lock className="text-muted-foreground absolute top-2.5 right-2.5 size-4" /></div></label>
            <label><span className="text-muted-foreground">Código contractual</span><Input value={f.contract_code} onChange={(e) => setF({ ...f, contract_code: e.target.value })} className="h-9" /></label>
            <label className="sm:col-span-2"><span className="text-muted-foreground">Nombre</span><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-9" /></label>
            <label><span className="text-muted-foreground">Cliente *</span><Input value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} className="h-9" /></label>
            <label><span className="text-muted-foreground">Operador</span><Input value={f.operador} onChange={(e) => setF({ ...f, operador: e.target.value })} className="h-9" /></label>
            <label><span className="text-muted-foreground">Zona horaria</span><Input value={f.zona_horaria} disabled readOnly className="h-9" /></label>
            <div className="grid grid-cols-2 gap-2"><label><span className="text-muted-foreground"><Calendar className="mr-1 inline size-3" />Inicio *</span><Input type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} className="h-9" /></label>
              <label><span className="text-muted-foreground">Fin *</span><Input type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} className="h-9" /></label></div>
          </div>
          <p className="font-semibold">Plazos PCI (no editables directamente)</p>
          <div className="flex flex-wrap gap-1.5">{plazos.map((p) => <Badge key={p} variant="outline">{etiquetaPlazo(p)}</Badge>)}</div>
          <p className="text-muted-foreground">Las fechas de cada plazo se fijan por PCI (Plazos del PCI, con versión).</p>
          <p className="font-semibold">Sectores</p>
          <div className="flex flex-wrap gap-1.5">{(q.data?.sectores ?? []).map((s) => <Badge key={s} variant="secondary">Sector {s}</Badge>)}</div>
          <label className="block"><span className="text-muted-foreground">Motivo del cambio *</span><Textarea rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se guarda como nueva versión" /></label>
          <p className="bg-info/[0.08] text-info flex items-center gap-2 rounded-md px-2.5 py-2"><Info className="size-3.5" />Guardar crea una nueva versión; las anteriores se conservan en el historial.</p>
          <div className="flex justify-end"><Button onClick={guardar} disabled={!motivo.trim() || !f.client_name || !f.starts_on || !f.ends_on}><Save className="size-4" />Guardar nueva versión</Button></div>
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[14px]"><History className="size-4" />Historial de versiones</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-[12.5px]">
          {(q.data?.versiones ?? []).map((v) => (
            <div key={v.id} className="rounded-md border border-border p-2">
              <p className="font-semibold">v{v.version} · {fmtDateTime(v.cuando)}</p>
              <p className="text-muted-foreground">{v.profiles?.full_name ?? 'Sistema'} · {v.motivo}</p>
              <p className="text-muted-foreground text-[11.5px]">{v.datos?.client_name} · {v.datos?.starts_on ? fmtDate(v.datos.starts_on) : '—'} – {v.datos?.ends_on ? fmtDate(v.datos.ends_on) : '—'}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
