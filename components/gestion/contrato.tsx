'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Calendar, Lock, History, Save, Info, Layers, ExternalLink, Eye, RefreshCw, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { etiquetaPlazo, usePlazosPci } from '@/lib/hooks/use-plazos-pci'
import { cn, fmtDate, fmtDateTime } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Configuración del sistema › Contrato» (ADMIN_SUB_Config_Contrato): datos
 * generales (código, cliente, operador, zona horaria, vigencia), alcance con
 * los sectores elegidos, plazos PCI en solo lectura (oficio y seguimiento),
 * vinculación con catálogo y fuente contractual; guardar crea una versión
 * nueva con motivo, tras «Vista previa» / «Revisar cambios». Guardar no
 * reasigna cuadrillas ni modifica plazos oficiales.
 */
const CAMPOS: [string, string][] = [
  ['contract_code', 'Código contractual'], ['name', 'Nombre'], ['client_name', 'Cliente'], ['operador', 'Operador'], ['zona_horaria', 'Zona horaria'],
  ['starts_on', 'Inicio'], ['ends_on', 'Fin'], ['sectores', 'Sectores del alcance'], ['fuente_contractual', 'Fuente contractual'], ['version_etiqueta', 'Versión'],
]

export function ConfigContrato() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const { plazos } = usePlazosPci()
  const q = useQuery({
    queryKey: ['contrato', service.id],
    queryFn: async () => {
      const [{ data: s }, { data: v }, { data: sec }, { data: pci }] = await Promise.all([
        sb.from('services').select('*').eq('id', service.id).maybeSingle(),
        sb.from('contrato_versiones' as any).select('*, profiles:quien(full_name)').eq('service_id', service.id).order('version', { ascending: false }),
        sb.from('service_sectors').select('code').eq('service_id', service.id).order('orden'),
        sb.from('pcis').select('id, code, document_path').eq('service_id', service.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(1),
      ])
      return { s: s as any, versiones: (v ?? []) as any[], sectores: ((sec ?? []) as any[]).map((x) => x.code as string), pci: ((pci ?? []) as any[])[0] }
    },
  })
  const inicial = React.useMemo(() => {
    const s = q.data?.s
    if (!s) return null
    return {
      name: s.name ?? '', code: s.code ?? '', client_name: s.client_name ?? '', contract_code: s.contract_code ?? '', starts_on: s.starts_on ?? '', ends_on: s.ends_on ?? '',
      operador: s.settings?.operador ?? 'GRUPO SERVICON V&D E.I.R.L.', zona_horaria: s.settings?.zona_horaria ?? 'America/Lima', description: s.description ?? '',
      sectores: (s.settings?.sectores_alcance as string[] | undefined) ?? q.data?.sectores ?? [],
      fuente_contractual: s.settings?.fuente_contractual ?? '', version_etiqueta: s.settings?.version_etiqueta ?? `v${q.data?.versiones[0]?.version ?? 1}.0`,
    }
  }, [q.data])
  const [f, setF] = React.useState<any>(null)
  const [motivo, setMotivo] = React.useState('')
  const [vista, setVista] = React.useState<'' | 'previa' | 'cambios'>('')
  const [detalle, setDetalle] = React.useState<any | null>(null)
  React.useEffect(() => { if (inicial && !f) setF(inicial) }, [inicial, f])
  const texto = (k: string, v: any) => (Array.isArray(v) ? (v.length ? v.join(', ') : '—') : k.endsWith('_on') && v ? fmtDate(v) : v || '—')
  const cambios = f && inicial ? CAMPOS.filter(([k]) => JSON.stringify(f[k]) !== JSON.stringify(inicial[k as keyof typeof inicial])) : []
  const guardar = async () => {
    const { data, error } = await sb.rpc('contrato_guardar' as any, { p_service: service.id, p_datos: f, p_motivo: motivo } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Contrato guardado como versión v${(data as any).version}`, { description: 'No reasigna cuadrillas ni modifica plazos oficiales.' })
    setMotivo(''); setVista(''); setF(null); qc.invalidateQueries({ queryKey: ['contrato'] })
  }
  const abrirOficio = async () => {
    const ruta = q.data?.pci?.document_path
    if (!ruta) return toast.info('El último PCI no tiene oficio adjunto', { description: 'Se adjunta al importar el PCI (paso Archivo).' })
    const { data, error } = await sb.storage.from('documentos').createSignedUrl(ruta, 600)
    if (error || !data?.signedUrl) return toast.error(mensajeAmigable(error, 'No se pudo abrir el oficio'))
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  if (!f) return null
  const todos = q.data?.sectores ?? []
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[14px]"><FileText className="size-4" />Contrato <Badge variant="info">v{q.data?.versiones[0]?.version ?? 1}</Badge></CardTitle>
            <CardDescription>Datos generales del contrato y parámetros base de operación.</CardDescription></CardHeader>
          <CardContent className="space-y-2.5 text-[12.5px]">
            <div className="grid gap-2 sm:grid-cols-2">
              <label><span className="text-muted-foreground">Código del contrato</span><div className="relative"><Input value={f.code} disabled readOnly className="h-9" /><Lock className="text-muted-foreground absolute top-2.5 right-2.5 size-4" /></div></label>
              <label><span className="text-muted-foreground">Código contractual *</span><Input value={f.contract_code} onChange={(e) => setF({ ...f, contract_code: e.target.value })} className="h-9" /></label>
              <label className="sm:col-span-2"><span className="text-muted-foreground">Nombre del contrato *</span><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-9" /></label>
              <label><span className="text-muted-foreground">Cliente *</span><Input value={f.client_name} onChange={(e) => setF({ ...f, client_name: e.target.value })} className="h-9" /></label>
              <label><span className="text-muted-foreground">Operador *</span><Input value={f.operador} onChange={(e) => setF({ ...f, operador: e.target.value })} className="h-9" /></label>
              <label><span className="text-muted-foreground">Zona horaria *</span><Input value={f.zona_horaria} disabled readOnly className="h-9" /></label>
            </div>
            <p className="flex items-center gap-1.5 font-semibold"><Calendar className="size-3.5" />Vigencia del contrato</p>
            <div className="grid grid-cols-2 gap-2"><label><span className="text-muted-foreground">Inicio *</span><Input type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} className="h-9" /></label>
              <label><span className="text-muted-foreground">Fin *</span><Input type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} className="h-9" /></label></div>
            <p className="flex items-center gap-1.5 font-semibold"><Layers className="size-3.5" />Alcance · Sectores configurados * <Badge variant="success">{f.sectores.length} sectores seleccionados</Badge></p>
            <div className="flex flex-wrap gap-1.5 rounded-md border border-border p-2">
              {todos.map((s) => {
                const on = f.sectores.includes(s)
                return (
                  <button key={s} type="button" onClick={() => setF({ ...f, sectores: on ? f.sectores.filter((x: string) => x !== s) : [...f.sectores, s].sort() })}
                    className={cn('rounded-full border px-2.5 py-0.5 text-[12px] font-semibold', on ? 'border-success bg-success/12 text-success' : 'border-border text-muted-foreground')}>
                    {on ? '✓ ' : ''}Sector {s}
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Plazos PCI (no se alteran automáticamente)</CardTitle>
              <CardDescription>Parámetros contractuales de plazos del PCI. Solo se modifican mediante un cambio de versión del PCI.</CardDescription></CardHeader>
            <CardContent className="space-y-2 text-[12.5px]">
              <div className="flex flex-wrap gap-1.5">{plazos.map((p) => <Badge key={p} variant="outline">{etiquetaPlazo(p)}</Badge>)}</div>
              <p className="flex items-center justify-between"><span><FileText className="mr-1 inline size-3.5" />Oficio{q.data?.pci ? ` · ${q.data.pci.code}` : ''}</span>
                <button onClick={abrirOficio} className="text-primary inline-flex items-center gap-1 font-semibold">Consultar documento <ExternalLink className="size-3" /></button></p>
              <p className="flex items-center justify-between"><span>Seguimiento fuente</span>
                <Link href={q.data?.pci ? `/pci/${q.data.pci.id}` : '/pci'} className="text-primary inline-flex items-center gap-1 font-semibold">Abrir seguimiento <ExternalLink className="size-3" /></Link></p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Vinculación y fuente</CardTitle>
              <CardDescription>Catálogo relacionado y fuente contractual de los parámetros.</CardDescription></CardHeader>
            <CardContent className="space-y-2 text-[12.5px]">
              <label className="block"><span className="text-muted-foreground">Catálogo vinculado</span>
                <span className="flex items-center gap-2"><Input readOnly value={`Catálogo PCI – Contrato ${f.contract_code || f.code}`} className="bg-secondary h-9" />
                  <Link href="/gestion/catalogos" aria-label="Abrir catálogo"><Link2 className="text-primary size-4" /></Link></span></label>
              <label className="block"><span className="text-muted-foreground">Fuente contractual</span>
                <Input value={f.fuente_contractual} onChange={(e) => setF({ ...f, fuente_contractual: e.target.value })} placeholder="Documento contractual autorizado (contrato, adenda, cláusula)" className="h-9" /></label>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[14px]">Cambio de versión</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-[12.5px]">
              <label className="block"><span className="text-muted-foreground">Versión *</span><Input value={f.version_etiqueta} onChange={(e) => setF({ ...f, version_etiqueta: e.target.value })} className="h-9" /></label>
              <label className="block"><span className="text-muted-foreground">Motivo del cambio *</span><Textarea rows={2} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Se guarda como nueva versión" /></label>
            </CardContent>
          </Card>
          <Card className="h-fit">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[14px]"><History className="size-4" />Historial de versiones</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-[12px]">
                <thead className="text-muted-foreground text-[11px]"><tr className="border-b border-border"><th className="px-3 py-1.5 text-left font-medium">Fecha</th><th className="text-left font-medium">Versión</th><th className="text-left font-medium">Motivo</th><th className="text-left font-medium">Actor</th><th /></tr></thead>
                <tbody>
                  {(q.data?.versiones ?? []).map((v) => (
                    <tr key={v.id} className="border-b border-border/60">
                      <td className="px-3 py-1.5 whitespace-nowrap">{fmtDateTime(v.cuando)}</td><td><strong>{v.datos?.version_etiqueta ?? `v${v.version}`}</strong></td>
                      <td className="max-w-32 truncate" title={v.motivo}>{v.motivo}</td><td>{v.profiles?.full_name ?? 'Sistema'}</td>
                      <td className="pr-2"><button onClick={() => setDetalle(v)} className="text-primary inline-flex items-center gap-1"><Eye className="size-3" />Ver detalle</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="bg-info/[0.08] text-info flex items-center gap-2 rounded-md px-2.5 py-2 text-[12.5px]"><Info className="size-3.5" />Guardar configuración no reasigna cuadrillas ni modifica plazos oficiales.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setVista('previa')}><Eye className="size-4" />Vista previa</Button>
          <Button variant="outline" onClick={() => setVista('cambios')}><RefreshCw className="size-4" />Revisar cambios{cambios.length ? ` (${cambios.length})` : ''}</Button>
          <Button onClick={guardar} disabled={!cambios.length || !motivo.trim() || !f.client_name || !f.starts_on || !f.ends_on || !f.sectores.length}><Save className="size-4" />Guardar versión</Button>
          <Button variant="outline" onClick={() => { setF(inicial); setMotivo('') }} disabled={!cambios.length && !motivo}>Cancelar</Button>
        </div>
      </div>
      <Dialog open={!!vista} onOpenChange={(o) => !o && setVista('')}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{vista === 'previa' ? 'Vista previa de la versión' : 'Revisar cambios'}</DialogTitle>
            <DialogDescription>{vista === 'previa' ? 'Así quedará el contrato al guardar.' : 'Antes (versión vigente) → Después (nueva versión).'}</DialogDescription></DialogHeader>
          <table className="w-full text-[12.5px]">
            <thead className="text-muted-foreground text-[11.5px]"><tr className="border-b border-border"><th className="py-1 text-left font-medium">Campo</th>{vista === 'cambios' && <th className="text-left font-medium">Antes</th>}<th className="text-left font-medium">{vista === 'cambios' ? 'Después' : 'Valor'}</th></tr></thead>
            <tbody>
              {(vista === 'cambios' ? cambios : CAMPOS).map(([k, t]) => (
                <tr key={k} className="border-b border-border/60">
                  <td className="py-1.5 font-medium">{t}</td>
                  {vista === 'cambios' && <td className="text-muted-foreground">{texto(k, inicial?.[k as keyof typeof inicial])}</td>}
                  <td className={cn(vista === 'cambios' && 'text-success font-semibold')}>{texto(k, f[k])}</td>
                </tr>
              ))}
              {vista === 'cambios' && !cambios.length && <tr><td colSpan={3} className="text-muted-foreground py-4 text-center">Sin cambios respecto de la versión vigente.</td></tr>}
            </tbody>
          </table>
          <p className="text-muted-foreground text-[12px]">Motivo: {motivo || '— (obligatorio para guardar)'}</p>
        </DialogContent>
      </Dialog>
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Versión {detalle?.datos?.version_etiqueta ?? `v${detalle?.version}`}</DialogTitle>
            <DialogDescription>{detalle ? `${fmtDateTime(detalle.cuando)} · ${detalle.profiles?.full_name ?? 'Sistema'} · ${detalle.motivo}` : ''}</DialogDescription></DialogHeader>
          <div className="space-y-1 text-[12.5px]">
            {CAMPOS.map(([k, t]) => <p key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{t}</span><span>{texto(k, detalle?.datos?.[k])}</span></p>)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
