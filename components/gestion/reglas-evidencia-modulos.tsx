'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Save, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { SkeletonList } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * Ronda 5, CP-07: reglas de evidencia por módulo, con alcance general
 * (contrato) o específico de una cuadrilla, que prevalece. La base aplica
 * GPS, sello y galería al cargar cada foto según su módulo
 * (t_evidencia_reglas › regla_evidencia).
 */
type Regla = { minimo?: string; gps?: string; sello?: string; galeria?: string; formatos?: string; revision?: string }

export const MODULOS_EVIDENCIA: { k: string; t: string; base: Regla; nota?: string }[] = [
  { k: 'pci', t: 'PCI', base: { minimo: '1 Antes · 1 Durante · 1 a 3 Después', gps: 'opcional', sello: 'opcional', galeria: 'permitida', formatos: 'JPG, PNG', revision: 'Supervisor valida; Residente publica; Visor COVINCA observa o da conformidad' }, nota: 'Estándar fijo del contrato; «General» no completa fases.' },
  { k: 'mr', t: 'Mantenimiento rutinario (parte diario)', base: { minimo: '1', gps: 'opcional', sello: 'opcional', galeria: 'permitida', formatos: 'JPG, PNG', revision: 'Supervisor valida el parte; Residente publica' } },
  { k: 'complementaria', t: 'Evidencia complementaria (General)', base: { minimo: '0', gps: 'opcional', sello: 'opcional', galeria: 'permitida', formatos: 'JPG, PNG', revision: 'Acompaña al parte; no reemplaza una fase' } },
  { k: 'inventario', t: 'Inventario vial', base: { minimo: '1', gps: 'opcional', sello: 'opcional', galeria: 'permitida', formatos: 'JPG, PNG', revision: 'Supervisor' } },
  { k: 'observaciones', t: 'Observaciones de campo', base: { minimo: '1', gps: 'opcional', sello: 'opcional', galeria: 'permitida', formatos: 'JPG, PNG', revision: 'Supervisor o Residente programa' } },
  { k: 'ats', t: 'ATS / IPERC', base: { minimo: '1', gps: 'opcional', sello: 'opcional', galeria: 'permitida', formatos: 'JPG, PNG, PDF', revision: 'Encargado SSOMA' } },
  { k: 'charla', t: 'Charla de 5 minutos', base: { minimo: '1', gps: 'opcional', sello: 'opcional', galeria: 'permitida', formatos: 'JPG, PNG, PDF', revision: 'Encargado SSOMA' } },
  { k: 'checklist', t: 'Checklist', base: { minimo: '1', gps: 'opcional', sello: 'opcional', galeria: 'permitida', formatos: 'JPG, PNG, PDF', revision: 'Encargado SSOMA' } },
  { k: 'vehiculos', t: 'Vehículos (checklist vehicular)', base: { minimo: '1', gps: 'opcional', sello: 'opcional', galeria: 'permitida', formatos: 'JPG, PNG, PDF', revision: 'Encargado SSOMA / Administrador' } },
  { k: 'inspecciones', t: 'Inspecciones SSOMA', base: { minimo: '1', gps: 'opcional', sello: 'opcional', galeria: 'permitida', formatos: 'JPG, PNG, PDF', revision: 'Encargado SSOMA' } },
]
const NOM: Record<string, string> = { obligatoria: 'Obligatoria', opcional: 'Opcional', permitida: 'Permitida', no_permitida: 'No permitida' }

export function ReglasEvidenciaPorModulo() {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const [alcance, setAlcance] = React.useState('') // '' = general; si no, id de cuadrilla
  const [editando, setEditando] = React.useState<string | null>(null)
  const datos = useQuery({
    queryKey: ['reglas-ev-modulos', service.id],
    queryFn: async () => {
      const [{ data: s, error }, { data: c }] = await Promise.all([
        sb.from('services').select('settings').eq('id', service.id).maybeSingle(),
        sb.from('crews').select('id, code, name').eq('service_id', service.id).is('deleted_at', null).order('code'),
      ])
      if (error) throw error
      const ev = ((s as any)?.settings?.evidencias ?? {}) as any
      return { ev, crews: (c ?? []) as any[] }
    },
  })
  if (datos.isLoading) return <SkeletonList rows={6} />
  if (datos.isError) return <p className="text-muted-foreground text-[12.5px]">No se pudieron cargar las reglas. <button className="text-primary underline" onClick={() => datos.refetch()}>Reintentar</button></p>
  const ev = datos.data!.ev
  const crews = datos.data!.crews
  // Regla vigente: específica › general del módulo › global del contrato › base
  const vigente = (m: (typeof MODULOS_EVIDENCIA)[number]) => {
    const glob: Regla = { gps: ev.gps, sello: ev.sello }
    const gen: Regla = ev.modulos?.[m.k] ?? {}
    const esp: Regla = alcance ? ev.cuadrillas?.[alcance]?.[m.k] ?? {} : {}
    const r: Regla = { ...m.base }
    const origen: Record<string, string> = {}
    for (const k of Object.keys(m.base) as (keyof Regla)[]) {
      if (esp[k] != null) { r[k] = esp[k]; origen[k] = 'específica' }
      else if (gen[k] != null) { r[k] = gen[k]; origen[k] = 'general' }
      else if (glob[k] != null) { r[k] = glob[k]; origen[k] = 'general' }
      else origen[k] = 'base'
    }
    if (m.k === 'pci') r.minimo = m.base.minimo
    return { r, origen, tieneEsp: Object.keys(esp).length > 0 }
  }
  const crewSel = crews.find((c) => c.id === alcance)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold">Alcance:</span>
        <select value={alcance} onChange={(e) => { setAlcance(e.target.value); setEditando(null) }} className="bg-card h-9 rounded-md border border-border px-2">
          <option value="">General (todo el contrato)</option>
          {crews.map((c) => <option key={c.id} value={c.id}>Específica · {c.code} · {c.name}</option>)}
        </select>
        <span className="text-muted-foreground">{alcance ? `Lo que se defina para ${crewSel?.code} prevalece sobre la regla general; lo que no se defina, la hereda.` : 'Aplica a todas las cuadrillas que no tengan una regla específica.'}</span>
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-[12.5px]">
          <thead className="bg-secondary/60 text-muted-foreground text-[11.5px]"><tr>
            {['Módulo', 'Mínimo de fotos', 'GPS', 'Sello', 'Galería', 'Formatos', 'Revisión', 'Alcance', ''].map((t) => <th key={t} className="px-3 py-2 text-left font-medium">{t}</th>)}
          </tr></thead>
          <tbody>
            {MODULOS_EVIDENCIA.map((m) => {
              const { r, origen, tieneEsp } = vigente(m)
              const marca = (k: keyof Regla) => origen[k] === 'específica' ? 'text-info font-semibold' : ''
              return (
                <React.Fragment key={m.k}>
                  <tr className="border-t border-border align-top">
                    <td className="px-3 py-2"><strong>{m.t}</strong>{m.nota && <span className="text-muted-foreground block text-[11px]">{m.nota}</span>}</td>
                    <td className={cn('px-3 py-2', marca('minimo'))}>{m.k === 'pci' && <Lock className="text-muted-foreground mr-1 inline size-3" />}{r.minimo}</td>
                    <td className={cn('px-3 py-2', marca('gps'))}>{NOM[r.gps!] ?? r.gps}</td>
                    <td className={cn('px-3 py-2', marca('sello'))}>{NOM[r.sello!] ?? r.sello}</td>
                    <td className={cn('px-3 py-2', marca('galeria'))}>{NOM[r.galeria!] ?? r.galeria}</td>
                    <td className={cn('px-3 py-2', marca('formatos'))}>{r.formatos}</td>
                    <td className={cn('px-3 py-2', marca('revision'))}>{r.revision}</td>
                    <td className="px-3 py-2">{tieneEsp ? <span className="bg-info/12 text-info rounded-full px-2 py-0.5 text-[11px] font-semibold">Específica {crewSel?.code}</span> : <span className="bg-secondary rounded-full px-2 py-0.5 text-[11px]">General</span>}</td>
                    <td className="px-3 py-2"><Button size="icon-sm" variant="outline" aria-label={`Editar ${m.t}`} onClick={() => setEditando(editando === m.k ? null : m.k)}>{editando === m.k ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}</Button></td>
                  </tr>
                  {editando === m.k && (
                    <tr className="bg-secondary/30"><td colSpan={9} className="px-3 py-3">
                      <Editor modulo={m} inicial={alcance ? ev.cuadrillas?.[alcance]?.[m.k] ?? {} : ev.modulos?.[m.k] ?? {}} vigente={r} crewId={alcance || null}
                        alGuardar={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['reglas-ev-modulos', service.id] }) }} />
                    </td></tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </CardContent></Card>
      <p className="text-muted-foreground text-[12px]">Al cargar una foto, SIGOV aplica el GPS, el sello y la galería del módulo al que pertenece (en azul, lo específico de la cuadrilla). Fecha y hora de captura: siempre obligatoria. Cada cambio pide motivo y queda en Auditoría.</p>
    </div>
  )
}

function Editor({ modulo, inicial, vigente, crewId, alGuardar }: { modulo: (typeof MODULOS_EVIDENCIA)[number]; inicial: Regla; vigente: Regla; crewId: string | null; alGuardar: () => void }) {
  const { service } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [v, setV] = React.useState<Regla>({ ...inicial })
  const [motivo, setMotivo] = React.useState('')
  const [guardando, setGuardando] = React.useState(false)
  const guardar = async (reglas: Regla) => {
    setGuardando(true)
    const limpio = Object.fromEntries(Object.entries(reglas).filter(([, x]) => x != null && String(x).trim() !== '').map(([k, x]) => [k, String(x).trim()]))
    const { error } = await sb.rpc('reglas_evidencia_modulo_guardar' as any, { p_service: service.id, p_crew: crewId, p_modulo: modulo.k, p_reglas: limpio, p_motivo: motivo } as any)
    setGuardando(false)
    if (error) return toast.error(mensajeAmigable(error))
    toast.success(`Reglas de ${modulo.t} guardadas`); alGuardar()
  }
  const sel = (k: keyof Regla, ops: string[]) => (
    <label className="space-y-1"><span className="text-muted-foreground block text-[11.5px]">{k === 'gps' ? 'GPS' : k === 'sello' ? 'Sello' : 'Galería'}</span>
      <select value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value || undefined })} className="bg-card h-9 rounded-md border border-border px-2">
        <option value="">{crewId ? 'Heredar' : 'Por defecto'} ({NOM[vigente[k]!] ?? vigente[k]})</option>
        {ops.map((o) => <option key={o} value={o}>{NOM[o]}</option>)}
      </select></label>
  )
  return (
    <div className="space-y-2.5 text-[12.5px]">
      <div className="flex flex-wrap items-end gap-3">
        {modulo.k === 'pci'
          ? <p className="text-muted-foreground flex items-center gap-1"><Lock className="size-3.5" />Mínimo fijo: 1 Antes, 1 Durante, 1 a 3 Después</p>
          : <label className="space-y-1"><span className="text-muted-foreground block text-[11.5px]">Mínimo de fotos</span><Input type="number" min={0} max={99} value={v.minimo ?? ''} placeholder={vigente.minimo} onChange={(e) => setV({ ...v, minimo: e.target.value || undefined })} className="h-9 w-24" /></label>}
        {sel('gps', ['obligatoria', 'opcional'])}
        {sel('sello', ['obligatoria', 'opcional'])}
        {sel('galeria', ['permitida', 'no_permitida'])}
        <label className="space-y-1"><span className="text-muted-foreground block text-[11.5px]">Formatos</span><Input value={v.formatos ?? ''} placeholder={vigente.formatos} maxLength={60} onChange={(e) => setV({ ...v, formatos: e.target.value || undefined })} className="h-9 w-36" /></label>
        <label className="min-w-[220px] flex-1 space-y-1"><span className="text-muted-foreground block text-[11.5px]">Revisión</span><Input value={v.revision ?? ''} placeholder={vigente.revision} maxLength={120} onChange={(e) => setV({ ...v, revision: e.target.value || undefined })} className="h-9" /></label>
      </div>
      <Textarea rows={2} maxLength={250} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del cambio (obligatorio)" />
      <div className="flex flex-wrap justify-end gap-2">
        {crewId && Object.keys(inicial).length > 0 && <Button variant="outline" loading={guardando} disabled={!motivo.trim()} onClick={() => guardar({})}>Quitar regla específica</Button>}
        <Button loading={guardando} disabled={!motivo.trim()} onClick={() => guardar(v)}><Save className="size-4" />Guardar {crewId ? 'regla específica' : 'regla general'}</Button>
      </div>
    </div>
  )
}
