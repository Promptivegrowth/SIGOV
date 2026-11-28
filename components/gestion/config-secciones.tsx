'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { History, Save, Info, Upload, Eye, Bell, Image as ImageIcon, FileSpreadsheet, FileText, Lock, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn, fmtDate, fmtDateTime, toISODate } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { fijarMarca, marcaActual, pdfBlob, type MarcaVigente } from '@/lib/reports'

/**
 * Configuración versionada (guía, funciones 16 y 17): Marca y formatos,
 * Alertas, Evidencias y Exportación. Cada cambio se revisa (Antes/Después),
 * lleva motivo y queda como versión con su historial; no reasigna
 * cuadrillas ni cambia plazos, fotos o catálogos.
 */
function useVersiones(seccion: 'marca' | 'alertas' | 'exportacion') {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  return useQuery({
    queryKey: ['config-versiones', service.id, seccion],
    queryFn: async () => ((await sb.from('config_versiones' as any).select('*, profiles:quien(full_name)').eq('service_id', service.id).eq('seccion', seccion).order('version', { ascending: false })).data ?? []) as any[],
  })
}

function GuardarVersion({ seccion, datos, antes, cambios, alGuardar }: { seccion: 'marca' | 'alertas' | 'exportacion'; datos: any; antes: any; cambios: [string, string, string][]; alGuardar?: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [abierto, setAbierto] = React.useState(false)
  const [motivo, setMotivo] = React.useState('')
  const [g, setG] = React.useState(false)
  const versiones = useVersiones(seccion)
  const [hist, setHist] = React.useState(false)
  const guardar = async () => {
    setG(true)
    const { data, error } = await sb.rpc('config_guardar' as any, { p_service: service.id, p_seccion: seccion, p_datos: datos, p_motivo: motivo } as any)
    setG(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Versión ${(data as any).version} guardada`)
    setAbierto(false); setMotivo('')
    qc.invalidateQueries({ queryKey: ['config-versiones', service.id, seccion] }); qc.invalidateQueries({ queryKey: ['marca-vigente'] })
    alGuardar?.()
  }
  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => setHist(true)}><History className="size-4" />Historial ({versiones.data?.length ?? 0})</Button>
        <Button onClick={() => setAbierto(true)} disabled={!cambios.length}><Eye className="size-4" />Revisar cambios</Button>
      </div>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Revisar cambios</DialogTitle><DialogDescription>Se guarda como versión nueva; la anterior queda en el historial.</DialogDescription></DialogHeader>
          <table className="w-full text-[12.5px]"><thead className="bg-secondary/50 text-left"><tr><th className="px-2 py-1">Campo</th><th className="px-2 py-1">Antes</th><th className="px-2 py-1">Después</th></tr></thead>
            <tbody className="divide-y divide-border">{cambios.map(([c, a, d]) => <tr key={c}><td className="px-2 py-1 font-semibold">{c}</td><td className="text-muted-foreground px-2 py-1">{a || '—'}</td><td className="text-success px-2 py-1">{d || '—'}</td></tr>)}</tbody></table>
          <label className="block space-y-1 text-[12.5px]"><span className="font-semibold">Motivo del cambio <span className="text-destructive">*</span></span>
            <Textarea rows={2} maxLength={250} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button><Button onClick={guardar} loading={g} disabled={!motivo.trim()}><Save className="size-4" />Guardar versión</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={hist} onOpenChange={setHist}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Historial de versiones</DialogTitle><DialogDescription>Inalterable: cada guardado es una versión nueva.</DialogDescription></DialogHeader>
          <ul className="max-h-[calc(var(--vh)_*_60)] space-y-1.5 overflow-y-auto text-[12.5px]">
            {(versiones.data ?? []).map((v) => <li key={v.id} className="rounded-lg border border-border p-2"><strong>v{v.version}</strong> · {fmtDateTime(v.cuando)} · {v.profiles?.full_name ?? ''}<p className="text-muted-foreground">{v.motivo}</p></li>)}
            {!(versiones.data ?? []).length && <li className="text-muted-foreground">Aún no hay versiones: rige la configuración de fábrica.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ═══ Marca y formatos ═════════════════════════════════════════════════════
type Formato = 'diario' | 'panel' | 'excel'
const FORMATOS: [Formato, string, any][] = [['diario', 'Reporte diario', FileText], ['panel', 'Panel fotográfico', ImageIcon], ['excel', 'Excel', FileSpreadsheet]]

export function ConfigMarca() {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const versiones = useVersiones('marca')
  const vigente = (versiones.data?.[0]?.datos ?? {}) as any
  const [d, setD] = React.useState<any>(null)
  const [formato, setFormato] = React.useState<Formato>('diario')
  const [corte, setCorte] = React.useState(toISODate(new Date()))
  const [logo, setLogo] = React.useState<File | null>(null)
  const [previa, setPrevia] = React.useState<string | null>(null)
  React.useEffect(() => { if (versiones.data && !d) setD({ logo: vigente.logo ?? null, formatos: vigente.formatos ?? {} }) }, [versiones.data, d, vigente])
  if (!d) return <p className="text-muted-foreground text-[13px]">Cargando…</p>
  const fx = d.formatos?.[formato] ?? {}
  const set = (k: 'encabezado' | 'pie', v: string) => setD({ ...d, formatos: { ...d.formatos, [formato]: { ...fx, [k]: v } } })
  const subirLogo = async () => {
    if (!logo) return
    if (!/image\/(png|jpeg)/.test(logo.type)) return toast.error('El logo debe ser PNG o JPG')
    const ruta = `${service.id}/marca/logo_${Date.now()}.${logo.type === 'image/png' ? 'png' : 'jpg'}`
    const { error } = await sb.storage.from('documentos').upload(ruta, logo, { contentType: logo.type })
    if (error) return toast.error(mensajeAmigable(error))
    setD({ ...d, logo: ruta }); setLogo(null); toast.success('Logo cargado; revisa la vista previa antes de guardar')
  }
  // Vista previa: el mismo PDF que saldría, con la marca en edición y la fecha de corte elegida
  const verPrevia = async () => {
    const anterior = marcaActual()
    let logoUrl: string | null = null
    if (d.logo) logoUrl = (await sb.storage.from('documentos').createSignedUrl(d.logo, 600)).data?.signedUrl ?? null
    fijarMarca({ logoUrl, formatos: d.formatos } as MarcaVigente)
    try {
      const b = await pdfBlob({ titulo: formato === 'panel' ? 'Panel fotográfico (vista previa)' : 'Reporte diario (vista previa)', servicio: service.name, cliente: (service as any).client_name,
        contrato: (service as any).contract_code, periodo: `Corte ${fmtDate(corte)}`, generadoPor: profile.full_name },
        [{ header: 'Ítem', key: 'a' }, { header: 'Actividad', key: 'b' }, { header: 'Metrado', key: 'c' }], [{ a: '1', b: 'Ejemplo de fila', c: '10.00 m' }], { cover: false })
      if (previa) URL.revokeObjectURL(previa)
      setPrevia(URL.createObjectURL(b))
    } finally {
      fijarMarca(anterior)
    }
  }
  const cambios: [string, string, string][] = []
  if ((d.logo ?? null) !== (vigente.logo ?? null)) cambios.push(['Logo', vigente.logo ? 'Logo anterior' : 'Logo de fábrica', d.logo ? 'Logo nuevo' : 'Logo de fábrica'])
  for (const [k, t] of FORMATOS) for (const c of ['encabezado', 'pie'] as const) {
    const a = vigente.formatos?.[k]?.[c] ?? ''
    const b = d.formatos?.[k]?.[c] ?? ''
    if (a !== b) cambios.push([`${t} · ${c}`, a, b])
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[14px]">Marca y formatos {versiones.data?.[0] && <span className="text-muted-foreground font-normal">· vigente v{versiones.data[0].version}</span>}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-[12.5px]">
          <div><p className="font-semibold">Logo oficial autorizado</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input type="file" accept="image/png,image/jpeg" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
              <Button size="sm" variant="outline" onClick={subirLogo} disabled={!logo}><Upload className="size-3.5" />Cargar</Button>
              {d.logo && <Button size="sm" variant="ghost" onClick={() => setD({ ...d, logo: null })}>Usar el de fábrica</Button>}
            </div>
            <p className="text-muted-foreground mt-1">{d.logo ? `Logo propio: ${d.logo.split('/').pop()}` : 'Logo de fábrica (Grupo Servicon).'}</p></div>
          <div className="bg-secondary flex gap-1 rounded-lg p-1">
            {FORMATOS.map(([k, t, I]) => <button key={k} onClick={() => setFormato(k)} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-semibold', formato === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}><I className="size-3.5" />{t}</button>)}
          </div>
          <label className="block space-y-1"><span className="font-semibold">Encabezado</span><Input value={fx.encabezado ?? ''} onChange={(e) => set('encabezado', e.target.value)} maxLength={70} placeholder="SISTEMA INTEGRAL DE GESTION OPERATIVA VIAL" /></label>
          <label className="block space-y-1"><span className="font-semibold">Pie</span><Input value={fx.pie ?? ''} onChange={(e) => set('pie', e.target.value)} maxLength={140} placeholder="Texto al pie de cada página" /></label>
          <label className="block space-y-1"><span className="font-semibold">Fecha de corte para la vista previa</span><Input type="date" value={corte} onChange={(e) => setCorte(e.target.value)} className="w-44" /></label>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={verPrevia} disabled={formato === 'excel'}><Eye className="size-4" />Vista previa</Button></div>
          <p className="bg-info/8 text-info rounded-lg p-2"><Info className="mr-1 inline size-3.5" />Cambiar el encabezado o el logo no cambia la fecha de captura de ninguna foto ni el vencimiento de los ítems. Las exportaciones anteriores conservan el formato con que salieron.</p>
          <GuardarVersion seccion="marca" datos={d} antes={vigente} cambios={cambios} />
        </CardContent>
      </Card>
      <Card><CardContent className="p-2">
        {previa ? <iframe src={previa} title="Vista previa" className="h-[560px] w-full rounded-lg border border-border" />
          : <p className="text-muted-foreground grid h-[300px] place-items-center text-center text-[12.5px]">Pulsa «Vista previa» para ver cómo queda el documento<br />con el logo, el encabezado y el pie en edición.</p>}
      </CardContent></Card>
    </div>
  )
}

/** Carga la marca vigente al entrar (lo usan todos los PDF y Excel). */
export function MarcaVigenteSync() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  useQuery({
    queryKey: ['marca-vigente', service.id],
    queryFn: async () => {
      const { data } = await sb.rpc('config_vigente' as any, { p_service: service.id, p_seccion: 'marca' } as any)
      const m = (data ?? null) as any
      let logoUrl: string | null = null
      if (m?.logo) logoUrl = (await sb.storage.from('documentos').createSignedUrl(m.logo, 60 * 60 * 12)).data?.signedUrl ?? null
      fijarMarca(m ? { logoUrl, formatos: m.formatos ?? {} } : null)
      return m ?? {}
    },
    staleTime: 30 * 60_000,
  })
  return null
}

// ═══ Alertas ══════════════════════════════════════════════════════════════
const EVENTOS: { k: string; t: string; dest: string; agr: string; frec: string; campo?: [string, string, number] }[] = [
  { k: 'pci', t: 'PCI por vencer y vencidos', dest: 'Administrador; Residente y Supervisor por su aviso', agr: 'Un aviso por PCI y versión', frec: 'Diaria', campo: ['anticipacion', 'Anticipación (días)', 2] },
  { k: 'mantenimiento', t: 'Mantenimiento de vehículos y equipos', dest: 'Administrador', agr: 'Por recurso', frec: 'Diaria', campo: ['anticipacion', 'Anticipación (días)', 7] },
  { k: 'rendicion', t: 'Ausencia de rendición', dest: 'Administrador', agr: 'Por caja', frec: 'Diaria', campo: ['dias', 'Días sin rendir', 7] },
  { k: 'sync', t: 'Sincronización fallida y conflictos', dest: 'Administrador; Supervisor de la cuadrilla', agr: 'Por equipo', frec: 'Al detectarse', campo: ['horas', 'Ventana (horas)', 48] },
  { k: 'evidencia', t: 'Evidencia incompleta', dest: 'Administrador', agr: 'Por ítem', frec: 'Al cambiar el estado' },
  { k: 'caja', t: 'Saldo bajo de caja', dest: 'Administrador', agr: 'Por caja', frec: 'Al cambiar el saldo' },
]
export function ConfigAlertas() {
  const versiones = useVersiones('alertas')
  const vigente = (versiones.data?.[0]?.datos?.reglas ?? {}) as any
  const [r, setR] = React.useState<any>(null)
  React.useEffect(() => { if (versiones.data && !r) setR(JSON.parse(JSON.stringify(vigente))) }, [versiones.data, r, vigente])
  if (!r) return <p className="text-muted-foreground text-[13px]">Cargando…</p>
  const val = (k: string, c: string, def: any) => r[k]?.[c] ?? def
  const set = (k: string, c: string, v: any) => setR({ ...r, [k]: { ...(r[k] ?? {}), [c]: v } })
  const cambios: [string, string, string][] = []
  for (const e of EVENTOS) {
    const a1 = String(vigente[e.k]?.activo ?? true), b1 = String(val(e.k, 'activo', true))
    if (a1 !== b1) cambios.push([`${e.t} · activa`, a1 === 'true' ? 'Sí' : 'No', b1 === 'true' ? 'Sí' : 'No'])
    if (e.campo) {
      const a2 = String(vigente[e.k]?.[e.campo[0]] ?? e.campo[2]), b2 = String(val(e.k, e.campo[0], e.campo[2]))
      if (a2 !== b2) cambios.push([`${e.t} · ${e.campo[1]}`, a2, b2])
    }
  }
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-[14px]">Alertas {versiones.data?.[0] && <span className="text-muted-foreground font-normal">· vigente v{versiones.data[0].version}</span>}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-[12.5px]">
        <div className="overflow-x-auto"><table className="w-full">
          <thead className="bg-secondary/50 text-left"><tr>{['Evento', 'Destinatario', 'Agrupación', 'Canal', 'Frecuencia', 'Anticipación', 'Activa'].map((t) => <th key={t} className="px-2 py-1.5 font-semibold">{t}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {EVENTOS.map((e) => (
              <tr key={e.k}>
                <td className="px-2 py-1.5 font-semibold"><Bell className="text-muted-foreground mr-1 inline size-3.5" />{e.t}</td>
                <td className="px-2">{e.dest}</td><td className="px-2">{e.agr}</td><td className="px-2">Interno de la aplicación</td><td className="px-2">{e.frec}</td>
                <td className="px-2">{e.campo ? <span className="flex items-center gap-1"><Input type="number" min={1} max={e.campo[0] === 'horas' ? 168 : 60} value={val(e.k, e.campo[0], e.campo[2])} onChange={(x) => set(e.k, e.campo![0], Number(x.target.value))} className="h-8 w-20" /><span className="text-muted-foreground">{e.campo[0] === 'horas' ? 'h' : 'd'}</span></span> : '—'}</td>
                <td className="px-2"><input type="checkbox" checked={!!val(e.k, 'activo', true)} onChange={(x) => set(e.k, 'activo', x.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="bg-info/8 text-info rounded-lg p-2"><Info className="mr-1 inline size-3.5" />Vista previa: un PCI publicado con 30 ítems genera <strong>un solo aviso agrupado</strong> por PCI y versión, desde el que se consultan los 30 ítems. El canal es interno de la aplicación: no suscribe a correo ni SMS.</p>
        <GuardarVersion seccion="alertas" datos={{ reglas: r }} antes={{ reglas: vigente }} cambios={cambios} />
      </CardContent>
    </Card>
  )
}

// ═══ Evidencias ═══════════════════════════════════════════════════════════
const REGLAS_EV: [string, string, string[]][] = [
  ['gps', 'GPS de la foto', ['opcional', 'obligatoria']], ['sello', 'Sello en la foto (fecha, hora, coordenadas)', ['obligatoria', 'opcional']],
  ['ats', 'ATS / IPERC: adjunto', ['minimo_1', 'opcional']], ['charla', 'Charla de 5 minutos: adjunto', ['minimo_1', 'opcional']], ['checklist', 'Checklist: adjunto', ['minimo_1', 'opcional']],
]
const NOMBRE_REGLA: Record<string, string> = { opcional: 'Opcional', obligatoria: 'Obligatoria', minimo_1: 'Al menos un adjunto' }
export function ConfigEvidencias() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['reglas-evidencia', service.id], queryFn: async () => (((await sb.from('services').select('settings').eq('id', service.id).maybeSingle()).data as any)?.settings?.evidencias ?? {}) as any })
  const [r, setR] = React.useState<any>(null)
  const [motivo, setMotivo] = React.useState('')
  React.useEffect(() => { if (q.data && !r) setR({ ...q.data }) }, [q.data, r])
  if (!r) return <p className="text-muted-foreground text-[13px]">Cargando…</p>
  const val = (k: string, def: string) => r[k] ?? q.data?.[k] ?? def
  const cambia = REGLAS_EV.some(([k, , ops]) => val(k, ops[0]) !== (q.data?.[k] ?? ops[0]))
  const guardar = async () => {
    const reglas = Object.fromEntries([['fecha_hora', 'obligatoria'], ...REGLAS_EV.map(([k, , ops]) => [k, val(k, ops[0])])])
    const { error } = await sb.rpc('reglas_evidencia_guardar' as any, { p_service: service.id, p_reglas: reglas, p_motivo: motivo } as any)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success('Reglas de evidencias guardadas'); setMotivo(''); qc.invalidateQueries({ queryKey: ['reglas-evidencia', service.id] }); setR(null)
  }
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-[14px]">Evidencias</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-[12.5px]">
        <div className="space-y-1.5">
          <p className="flex items-center gap-2"><Lock className="text-muted-foreground size-3.5" /><strong>Fecha y hora de captura:</strong> Obligatoria (no se desactiva)</p>
          <p className="flex items-center gap-2"><Lock className="text-muted-foreground size-3.5" /><strong>Fases por ítem:</strong> una foto Antes (1), una Durante (2) y hasta tres Después (3, 3_A, 3_B). Nunca «fase 4».</p>
          <p className="flex items-center gap-2"><Lock className="text-muted-foreground size-3.5" /><strong>General / complementaria:</strong> no reemplaza una fase ausente.</p>
        </div>
        {REGLAS_EV.map(([k, t, ops]) => (
          <label key={k} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"><span>{t}</span>
            <select value={val(k, ops[0])} onChange={(e) => setR({ ...r, [k]: e.target.value })} className="bg-card h-8 rounded-md border border-border px-2">{ops.map((o) => <option key={o} value={o}>{NOMBRE_REGLA[o]}</option>)}</select></label>
        ))}
        <p className="text-muted-foreground">El GPS no es obligatorio en forma universal: una foto sin señal se conserva con su fecha y hora. El reporte diario es digital y no exige foto.</p>
        <Textarea rows={2} maxLength={250} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del cambio (obligatorio)" />
        <div className="flex justify-end"><Button onClick={guardar} disabled={!cambia || !motivo.trim()}><Save className="size-4" />Guardar</Button></div>
      </CardContent>
    </Card>
  )
}

// ═══ Exportación ═════════════════════════════════════════════════════════
export function ConfigExportacion() {
  const versiones = useVersiones('exportacion')
  const vigente = (versiones.data?.[0]?.datos ?? {}) as any
  const [ret, setRet] = React.useState<number | null>(null)
  const [item, setItem] = React.useState('800')
  React.useEffect(() => { if (versiones.data && ret === null) setRet(Number(vigente.retencion_dias ?? 30)) }, [versiones.data, ret, vigente])
  const actual = Number(vigente.retencion_dias ?? 30)
  const cambios: [string, string, string][] = ret !== null && ret !== actual ? [['Retención de copias temporales', `${actual} días`, `${ret} días`]] : []
  const n = item.trim() || '800'
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[14px]">Exportación {versiones.data?.[0] && <span className="text-muted-foreground font-normal">· vigente v{versiones.data[0].version}</span>}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-[12.5px]">
          <p className="font-semibold">Formatos disponibles</p>
          <div className="flex flex-wrap gap-2">{[['Excel', FileSpreadsheet], ['PDF', FileText], ['Panel JPG', ImageIcon]].map(([t, I]: any) => <span key={t} className="bg-secondary flex items-center gap-1.5 rounded-lg px-3 py-1.5"><I className="size-4" />{t}</span>)}</div>
          <p className="text-muted-foreground">El panel JPG solo se ofrece cuando hay evidencias; el mapa, solo con coordenadas. El JPG es un JPEG real: un PNG se convierte en una copia de exportación sin modificar el original.</p>
          <label className="block space-y-1"><span className="font-semibold">Retención de copias temporales (días)</span>
            <Input type="number" min={1} max={365} value={ret ?? 30} onChange={(e) => setRet(Number(e.target.value))} className="w-28" /></label>
          <p className="text-muted-foreground">Las copias del historial de exportaciones se eliminan pasado ese plazo. La retención no elimina originales ni la bitácora; cancelar una exportación no borra su fuente.</p>
          <p className="bg-warning/10 rounded-lg p-2"><Lock className="mr-1 inline size-3.5" />Los filtros y los permisos de la exportación no se pueden desactivar desde Configuración.</p>
          <p><Link href="/reportes" className="text-primary underline"><ExternalLink className="mr-0.5 inline size-3" />Centro de reportes</Link>: progreso, historial y descarga de exportaciones.</p>
          <GuardarVersion seccion="exportacion" datos={{ ...vigente, retencion_dias: ret ?? 30 }} antes={vigente} cambios={cambios} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[14px]">Nomenclatura de fotos</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-[12.5px]">
          <label className="flex items-center gap-2">Número de ítem: <Input value={item} onChange={(e) => setItem(e.target.value.replace(/[^\w-]/g, ''))} className="h-8 w-24" /></label>
          <ul className="space-y-1 font-mono">
            <li>ITEM_{n}(1).jpg <span className="text-muted-foreground font-sans">· Antes</span></li>
            <li>ITEM_{n}(2).jpg <span className="text-muted-foreground font-sans">· Durante</span></li>
            <li>ITEM_{n}(3).jpg <span className="text-muted-foreground font-sans">· Después</span></li>
            <li>ITEM_{n}(3)_A.jpg <span className="text-muted-foreground font-sans">· Después adicional</span></li>
            <li>ITEM_{n}(3)_B.jpg <span className="text-muted-foreground font-sans">· Después adicional</span></li>
          </ul>
          <p className="text-muted-foreground">Sin espacio antes del paréntesis. Las fotos Después adicionales conservan la fase 3 con sufijo; nunca se llaman fase 4 ni se sobrescriben. Si llegaron dos fotos Antes, se exporta una como (1) y la otra se conserva como original adicional.</p>
          <p className="text-muted-foreground">Nomenclatura fija (decisión confirmada): no se edita desde aquí.</p>
        </CardContent>
      </Card>
    </div>
  )
}
