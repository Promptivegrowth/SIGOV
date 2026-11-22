'use client'

import * as React from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList, AlertCircle, CheckCircle2, Layers, Search, Eye, MapPin, Send, Users, HardHat, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SkeletonList } from '@/components/ui/skeleton'
import { RevisionRapida } from '@/components/pci/revision-item'
import { cn, fmtNumber, fmtProgresiva } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'

/**
 * «Revisión de reportes» (Supervisor, sus cuadrillas) y «Revisión del
 * contrato» (Residente y Administrador, todas). Maquetas
 * 03_SUPERVISOR_MOVIL_REVISION y 03_RESIDENTE_MOVIL_REVISION; guía 3.5–3.6.
 *
 * Lista lo que la cuadrilla reportó con sus fases A/D/Dp y, al elegir un
 * ítem, el mismo panel de decisión de la página del ítem: Validar SERVICON o
 * Devolver al jefe; el Residente además publica a COVINCA (uno o varios).
 * La regla vive en el servidor (pci_validar / pci_publicar).
 */
type Tab = 'por_validar' | 'observados' | 'validados' | 'todos' | 'por_publicar' | 'historial'

const PESTANAS: Record<'supervisor' | 'residente', { k: Tab; t: string; i: any }[]> = {
  supervisor: [
    { k: 'por_validar', t: 'Por validar', i: ClipboardList },
    { k: 'observados', t: 'Observados', i: AlertCircle },
    { k: 'validados', t: 'Historial', i: Layers },
  ],
  residente: [
    { k: 'todos', t: 'Todos', i: ClipboardList },
    { k: 'por_publicar', t: 'Validados', i: CheckCircle2 },
    { k: 'historial', t: 'Historial', i: Layers },
  ],
}

const CHIP: Record<string, { t: string; c: string }> = {
  por_validar: { t: 'Por validar', c: 'bg-info/12 text-info' },
  observados: { t: 'Observado', c: 'bg-warning/15 text-warning' },
  por_publicar: { t: 'Validado SERVICON', c: 'bg-success/12 text-success' },
  en_covinca: { t: 'Publicado · por revisar COVINCA', c: 'bg-info/12 text-info' },
  conformes: { t: 'Conforme COVINCA', c: 'bg-success/12 text-success' },
}

export function BandejaClient() {
  const { service, role } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const esSupervisor = role === 'supervisor'
  const pestanas = PESTANAS[esSupervisor ? 'supervisor' : 'residente']
  const f = {
    tab: (sp.get('tab') as Tab) || pestanas[0].k, item: sp.get('item') ?? '', crew: sp.get('crew') ?? '', pci: sp.get('pci') ?? '',
    sup: sp.get('sup') ?? '', desde: sp.get('desde') ?? '', hasta: sp.get('hasta') ?? '', q: sp.get('q') ?? '',
  }
  const fijar = (c: Partial<typeof f>) => {
    const n = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(c)) { if (v) n.set(k, v); else n.delete(k) }
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const [q, setQ] = React.useState(f.q)
  React.useEffect(() => { const t = setTimeout(() => q !== f.q && fijar({ q }), 400); return () => clearTimeout(t) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const [marcados, setMarcados] = React.useState<string[]>([])
  const [publicando, setPublicando] = React.useState(false)

  const datos = useQuery({
    queryKey: ['bandeja-revision', service.id, f.tab, f.crew, f.pci, f.sup, f.desde, f.hasta, f.q],
    queryFn: async () => {
      const { data, error } = await sb.rpc('bandeja_revision' as any, {
        p_service: service.id, p_tab: f.tab, p_crew: f.crew || null, p_pci: f.pci || null, p_supervisor: f.sup || null,
        p_desde: f.desde || null, p_hasta: f.hasta || null, p_q: f.q || null,
      } as any)
      if (error) throw error
      return data as any
    },
  })
  const d = datos.data
  const filas = (d?.filas ?? []) as any[]
  React.useEffect(() => { setMarcados([]) }, [f.tab, f.crew, f.pci, f.sup, f.desde, f.hasta, f.q])

  const publicarVarios = async () => {
    setPublicando(true)
    const { data, error } = await sb.rpc('pci_publicar', { p_items: marcados, p_nota: null } as any)
    setPublicando(false)
    if (error) { toast.error(mensajeAmigable(error)); return }
    const omitidos = ((data as any)?.omitidos ?? []) as any[]
    const hechos = marcados.length - omitidos.length
    toast.success(`${hechos} ${hechos === 1 ? 'ítem publicado' : 'ítems publicados'} a COVINCA`,
      omitidos.length ? { description: `No se publicó: ${omitidos.map((o) => `ítem ${o.item} (${o.motivo})`).join(', ')}` } : undefined)
    setMarcados([])
    qc.invalidateQueries({ queryKey: ['bandeja-revision'] })
    qc.invalidateQueries({ queryKey: ['inicio-pci'] })
  }

  const c = d?.conteos ?? {}
  const contadores = esSupervisor
    ? [{ n: c.por_validar, t: 'Por validar', i: ClipboardList, cl: 'text-info', tab: 'por_validar' as Tab },
       { n: c.observados, t: 'Observados', i: AlertCircle, cl: 'text-warning', tab: 'observados' as Tab },
       { n: c.validados, t: 'Validados', i: CheckCircle2, cl: 'text-success', tab: 'validados' as Tab }]
    : [{ n: c.por_validar, t: 'Por revisar', i: ClipboardList, cl: 'text-info', tab: 'todos' as Tab },
       { n: c.observados, t: 'Observados', i: AlertCircle, cl: 'text-warning', tab: 'todos' as Tab },
       { n: c.por_publicar, t: 'Validados por publicar', i: CheckCircle2, cl: 'text-success', tab: 'por_publicar' as Tab }]
  const puedePublicar = role === 'residente' && f.tab === 'por_publicar'
  const total: number | undefined = c[f.tab]
  const todosMarcados = filas.length > 0 && marcados.length === filas.length

  return (
    <>
      <PageHeader
        title={esSupervisor ? 'Revisión de reportes' : 'Revisión del contrato'}
        description={esSupervisor ? 'Mis cuadrillas · lo reportado por la cuadrilla, por validar o devolver.' : 'Todas las cuadrillas · validar, publicar a COVINCA u observar.'}
      />
      <PageBody className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {contadores.map((x) => (
            <button key={x.t} onClick={() => fijar({ tab: x.tab, item: '' })} className="text-left">
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="flex items-center gap-3 p-4">
                  <x.i className={cn('size-6 shrink-0', x.cl)} />
                  <div><p className={cn('text-[22px] font-bold tabular-nums', x.cl)}>{x.n == null ? '—' : fmtNumber(x.n)}</p>
                    <p className="text-muted-foreground text-[12px]">{x.t}</p></div>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>

        <div className="bg-secondary inline-flex flex-wrap rounded-lg p-1">
          {pestanas.map((p) => (
            <button key={p.k} onClick={() => fijar({ tab: p.k, item: '' })}
              className={cn('flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                f.tab === p.k ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <p.i className="size-3.5" />{p.t}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="relative min-w-60 flex-[2]">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-8"
                placeholder={esSupervisor ? 'Buscar por PCI, ítem, actividad o progresiva...' : 'Buscar PCI, ítem, cuadrilla o progresiva...'} />
            </div>
            <Filtro icono={Users} valor={f.crew} cambiar={(v) => fijar({ crew: v, item: '' })} todos="Cuadrilla: Todas"
              opciones={(d?.cuadrillas ?? []).map((x: any) => ({ v: x.id, t: x.nombre ?? x.codigo }))} />
            {!esSupervisor && (
              <Filtro icono={HardHat} valor={f.sup} cambiar={(v) => fijar({ sup: v, item: '' })} todos="Supervisor: Todos"
                opciones={(d?.supervisores ?? []).map((x: any) => ({ v: x.id, t: x.nombre }))} />
            )}
            <Filtro icono={MapPin} valor={f.pci} cambiar={(v) => fijar({ pci: v, item: '' })} todos="PCI: Todos"
              opciones={(d?.pcis ?? []).map((x: any) => ({ v: x.id, t: String(x.codigo).replace(/^PCI-\d{4}-0*/, 'PCI ') }))} />
            <label className="text-[11px]"><span className="text-muted-foreground"><Calendar className="mr-1 inline size-3" />Desde</span>
              <Input type="date" value={f.desde} onChange={(e) => fijar({ desde: e.target.value, item: '' })} className="h-9" /></label>
            <label className="text-[11px]"><span className="text-muted-foreground"><Calendar className="mr-1 inline size-3" />Hasta</span>
              <Input type="date" value={f.hasta} onChange={(e) => fijar({ hasta: e.target.value, item: '' })} className="h-9" /></label>
          </CardContent>
        </Card>

        {datos.error && <p className="text-destructive text-[13px]">No se pudo cargar: {mensajeAmigable(datos.error)}</p>}

        <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
          <Card className="min-w-0">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-[14px]">{esSupervisor ? 'Reportes recibidos' : 'Reportes disponibles'}</CardTitle>
                <CardDescription>
                  {esSupervisor ? `${fmtNumber(filas.length)} ${filas.length === 1 ? 'reporte' : 'reportes'}`
                    : `${fmtNumber(filas.length)} de ${fmtNumber(c.todos ?? 0)} reportes`}
                  {total != null && total > filas.length ? ` · se muestran los ${filas.length} más recientes` : ''}
                </CardDescription>
              </div>
              {puedePublicar && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={!filas.length}
                    onClick={() => setMarcados(todosMarcados ? [] : filas.map((x) => x.id))}>
                    {todosMarcados ? 'Quitar selección' : 'Seleccionar todos'}
                  </Button>
                  <Button size="sm" disabled={!marcados.length} loading={publicando} onClick={publicarVarios}>
                    <Send className="size-4" />Publicar a COVINCA{marcados.length ? ` (${marcados.length})` : ''}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {datos.isLoading ? <div className="p-4"><SkeletonList rows={6} /></div> : filas.length === 0 ? (
                <p className="text-muted-foreground px-4 pb-6 text-[13px]">Sin reportes en este filtro.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {filas.map((x) => {
                    const sel = f.item === x.id
                    const chip = CHIP[x.grupo] ?? CHIP.por_validar
                    return (
                      <li key={x.id} className={cn('flex items-center gap-3 px-4 py-2.5', sel && 'bg-primary/[0.07] ring-primary/40 ring-1 ring-inset')}>
                        {puedePublicar && (
                          <input type="checkbox" className="size-4" aria-label={`Elegir ítem ${x.item}`}
                            checked={marcados.includes(x.id)} onChange={(e) => setMarcados(e.target.checked ? [...marcados, x.id] : marcados.filter((m) => m !== x.id))} />
                        )}
                        <span className="bg-info/12 text-info grid size-8 shrink-0 place-items-center rounded-full"><ClipboardList className="size-4" /></span>
                        <div className="min-w-0 flex-1 text-[12.5px]">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <strong className="text-[13px]">{esSupervisor ? `Ítem ${x.item}` : `${x.cuadrilla_nombre ?? x.cuadrilla ?? 'Sin cuadrilla'} · Ítem ${x.item}`}</strong>
                            <span className="text-muted-foreground">{String(x.pci_code).replace(/^PCI-\d{4}-0*/, 'PCI ')}</span>
                            {!esSupervisor && <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', chip.c)}>● {x.grupo === 'en_covinca' ? `Publicado v${x.version}` : chip.t}</span>}
                            {!esSupervisor && <span className="text-muted-foreground text-[11px]">{x.grupo === 'observados' ? (x.observado_por ?? 'SERVICON') : 'SERVICON'}</span>}
                          </p>
                          <p className="text-muted-foreground truncate">{x.actividad}</p>
                          <p className="text-muted-foreground"><MapPin className="mr-0.5 inline size-3" />{fmtProgresiva(x.prog_ini)}{x.prog_fin && x.prog_fin !== x.prog_ini ? ` – ${fmtProgresiva(x.prog_fin)}` : ''}
                            {x.motivo && <span className="text-warning"> · {x.motivo}</span>}</p>
                        </div>
                        <div className="hidden gap-1 sm:flex">
                          <Fase t="A" n={x.antes} /><Fase t="D" n={x.durante} /><Fase t="Dp" n={x.despues} />
                        </div>
                        <Button size="sm" variant={sel ? 'default' : 'outline'} onClick={() => fijar({ item: sel ? '' : x.id })}>
                          <Eye className="size-3.5" />Revisar
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <div className="min-w-0">
            {f.item ? <RevisionRapida key={f.item} itemId={f.item} /> : (
              <Card><CardContent className="text-muted-foreground p-6 text-[13px]">Elige un reporte y pulsa «Revisar» para ver sus fases y decidir.</CardContent></Card>
            )}
          </div>
        </div>
      </PageBody>
    </>
  )
}

function Fase({ t, n }: { t: string; n: number }) {
  const ok = n > 0
  return (
    <span title={ok ? `${n} foto(s)` : 'Falta'} className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold',
      ok ? 'bg-success/12 text-success' : 'bg-secondary text-muted-foreground')}>{t}{ok ? '✓' : '–'}</span>
  )
}

function Filtro({ icono: I, valor, cambiar, todos, opciones }: { icono: any; valor: string; cambiar: (v: string) => void; todos: string; opciones: { v: string; t: string }[] }) {
  return (
    <Select value={valor || '__t'} onValueChange={(v) => cambiar(v === '__t' ? '' : v)}>
      <SelectTrigger className="h-9 min-w-40"><I className="text-muted-foreground size-3.5" /><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="__t">{todos}</SelectItem>
        {opciones.map((o) => <SelectItem key={o.v} value={o.v}>{o.t}</SelectItem>)}</SelectContent>
    </Select>
  )
}
