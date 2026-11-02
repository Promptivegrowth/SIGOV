'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { animate, motion, useReducedMotion, type Variants } from 'motion/react'
import {
  ArrowLeft, ArrowUpDown, CalendarClock, CircleCheck, Clock, FileDown, Gauge, Hourglass,
  ImageDown, Layers, ListChecks, MapPin, OctagonAlert, Sparkles, ShieldCheck,
} from 'lucide-react'
import { createClient, fetchAll } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { LoadError } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  calcularEstado, diaMes, fechaPeru, pciCorto, SITUACION,
  type EstadoSituacional, type FilaEstado, type ItemEstado, type Sector, type Situacion,
} from '@/lib/estado-situacional'
import { cn, fmtDate, fmtNumber, truncate } from '@/lib/utils'
import { mensajeAmigable } from '@/lib/errores'
import { toast } from 'sonner'

const SUAVE = [0.22, 1, 0.36, 1] as const

const contenedor: Variants = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
}
const pieza: Variants = {
  oculto: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: SUAVE } },
}

const plazoTexto = (d: number | null) => (d == null ? 'Sin plazo' : d === 1 ? '1 día' : `${d} días`)

/**
 * El estado situacional de un PCI, como la lámina que COVINCA arma para
 * cada PCI (Elvis, 26/10: «mantener un modelo de lo que se va a exportar»):
 * cifras, avance por plazo y por sector, la observación operativa y el
 * detalle, a la fecha de corte que se elija. Se descarga en PNG o PDF.
 */
export function EstadoSituacionalClient({ pciId }: { pciId: string }) {
  const { service, profile } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const hoy = React.useMemo(() => fechaPeru(Date.now()), [])
  const [corte, setCorte] = React.useState(hoy)
  const [exportando, setExportando] = React.useState<'png' | 'pdf' | null>(null)
  const lamina = React.useRef<HTMLDivElement>(null)

  // Las mismas consultas que el detalle del PCI: comparten la caché
  const pci = useQuery({
    queryKey: ['pci', pciId],
    queryFn: async () => {
      const { data, error } = await sb.from('pcis').select('*').eq('id', pciId).single()
      if (error) throw error
      return data
    },
  })
  const items = useQuery({
    queryKey: ['pci-items', pciId],
    queryFn: async () =>
      await fetchAll((from, to) =>
        sb.from('v_pci_items').select('*').eq('pci_id', pciId).order('item_number').order('id').range(from, to)
      ),
  })
  const sectores = useQuery({
    queryKey: ['service-sectors', service.id],
    queryFn: async () => {
      const { data, error } = await sb
        .from('service_sectors')
        .select('code, section_id, prog_start_m, prog_end_m, orden')
        .eq('service_id', service.id)
      if (error) throw error
      return (data ?? []).map((s) => ({ ...s, prog_start_m: Number(s.prog_start_m), prog_end_m: Number(s.prog_end_m) })) as Sector[]
    },
    staleTime: 10 * 60_000,
  })

  const estado = React.useMemo<EstadoSituacional | null>(() => {
    if (!items.data || !sectores.data) return null
    return calcularEstado(items.data as unknown as ItemEstado[], sectores.data, corte)
  }, [items.data, sectores.data, corte])

  const p = pci.data
  const titulo = pciCorto(p?.code)
  const archivo = `SIGOV_${(p?.code ?? 'PCI').replace(/\s+/g, '_')}_estado_${corte}`

  // ─── Descargas ───────────────────────────────────────────────────────
  const capturar = async () => {
    const nodo = lamina.current
    if (!nodo) throw new Error('La lámina aún no está lista')
    const { toPng } = await import('html-to-image')
    const fondo = getComputedStyle(document.body).backgroundColor
    // Dos veces la resolución de pantalla: se lee bien impresa en A4
    const opciones = { pixelRatio: 2, backgroundColor: fondo, cacheBust: true }
    // La primera pasada carga las fuentes e imágenes; la segunda sale completa
    await toPng(nodo, opciones).catch(() => null)
    return { url: await toPng(nodo, opciones), ancho: nodo.offsetWidth, alto: nodo.offsetHeight }
  }

  const descargarPng = async () => {
    setExportando('png')
    try {
      const { url } = await capturar()
      const a = document.createElement('a')
      a.href = url
      a.download = archivo + '.png'
      a.click()
      toast.success('Imagen descargada')
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo generar la imagen'))
    } finally {
      setExportando(null)
    }
  }

  const descargarPdf = async () => {
    if (!estado) return
    setExportando('pdf')
    try {
      const { url, ancho, alto } = await capturar()
      const [{ jsPDF }, autoTable] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable').then((m) => m.default),
      ])
      // La lámina en la primera hoja, entera; el detalle, en tabla a continuación
      const vertical = alto > ancho
      const doc = new jsPDF({ orientation: vertical ? 'portrait' : 'landscape', unit: 'mm', format: 'a4' })
      const W = doc.internal.pageSize.getWidth()
      const H = doc.internal.pageSize.getHeight()
      const m = 8
      const escala = Math.min((W - 2 * m) / ancho, (H - 2 * m) / alto)
      const w = ancho * escala
      const h = alto * escala
      doc.addImage(url, 'PNG', (W - w) / 2, m, w, h)

      doc.addPage('a4', 'landscape')
      doc.setFontSize(13)
      doc.setTextColor(7, 45, 112)
      doc.text(`${titulo} · Detalle de ítems al ${fmtDate(corte)}`, 10, 13)
      autoTable(doc, {
        startY: 18,
        head: [['N.º', 'Sector', 'Progresiva', 'Actividad', 'Descripción', 'Plazo', 'Vence', 'Situación']],
        body: estado.filas
          .slice()
          .sort((a, b) => (a.item_number ?? 0) - (b.item_number ?? 0))
          .map((f) => [
            f.item_number ?? '',
            f.sector,
            f.prog_start_txt ?? '—',
            f.activity_name ?? '—',
            truncate(f.description, 90),
            plazoTexto(f.term_days),
            fmtDate(f.due_date),
            SITUACION[f.situacion].label,
          ]),
        styles: { fontSize: 7.5, cellPadding: 1.6 },
        headStyles: { fillColor: [7, 45, 112], textColor: 255 },
        alternateRowStyles: { fillColor: [244, 246, 250] },
        columnStyles: { 0: { halign: 'right', cellWidth: 11 }, 1: { cellWidth: 14 }, 2: { cellWidth: 22 }, 5: { cellWidth: 16 }, 6: { cellWidth: 20 }, 7: { cellWidth: 30 } },
        didParseCell: (d: any) => {
          if (d.section === 'body' && d.column.index === 7) {
            const s = estado.filas.find((f) => SITUACION[f.situacion].label === d.cell.raw)?.situacion
            const color: Record<Situacion, [number, number, number]> = {
              atendido: [11, 134, 55], en_plazo: [176, 110, 0], vence_hoy: [198, 119, 0], vencido: [200, 30, 30],
            }
            if (s) {
              d.cell.styles.textColor = color[s]
              d.cell.styles.fontStyle = 'bold'
            }
          }
        },
        didDrawPage: () => {
          doc.setFontSize(7)
          doc.setTextColor(120)
          doc.text(`SIGOV · ${service.name} · generado por ${profile.full_name}`, 10, doc.internal.pageSize.getHeight() - 6)
        },
      })
      doc.save(archivo + '.pdf')
      toast.success('PDF descargado')
    } catch (e) {
      toast.error(mensajeAmigable(e, 'No se pudo generar el PDF'))
    } finally {
      setExportando(null)
    }
  }

  const error = pci.error || items.error || sectores.error

  return (
    <>
      <PageHeader
        title={`${titulo} · Estado situacional`}
        description={p?.title ?? undefined}
        icon={Gauge}
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/pci/${pciId}`}>
                <ArrowLeft className="size-4" />
                Volver al PCI
              </Link>
            </Button>
            <label className="border-border bg-card flex h-9 items-center gap-2 rounded-md border px-2.5 text-[12.5px]">
              <CalendarClock className="text-muted-foreground size-4" />
              <span className="text-muted-foreground">Corte</span>
              <Input
                type="date"
                value={corte}
                max={hoy}
                onChange={(e) => e.target.value && setCorte(e.target.value)}
                className="h-7 w-[8.6rem] border-0 px-1 shadow-none focus-visible:ring-0"
                aria-label="Fecha de corte"
              />
            </label>
            <Button variant="outline" loading={exportando === 'png'} disabled={!estado} onClick={descargarPng}>
              <ImageDown className="size-4" />
              PNG
            </Button>
            <Button variant="outline" loading={exportando === 'pdf'} disabled={!estado} onClick={descargarPdf}>
              <FileDown className="size-4" />
              PDF
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        {error ? (
          <LoadError message={mensajeAmigable(error)} onRetry={() => { pci.refetch(); items.refetch(); sectores.refetch() }} />
        ) : !estado || !p ? (
          <Esqueleto />
        ) : (
          <>
            <Lamina ref={lamina} estado={estado} titulo={titulo} pci={p} corte={corte} />
            <Detalle filas={estado.filas} />
          </>
        )}
      </PageBody>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// La lámina: lo que se descarga
// ═══════════════════════════════════════════════════════════════════════════

const Lamina = React.forwardRef<HTMLDivElement, { estado: EstadoSituacional; titulo: string; pci: any; corte: string }>(
  function Lamina({ estado: e, titulo, pci, corte }, ref) {
    const reducir = useReducedMotion()
    return (
      <motion.div
        ref={ref}
        className="bg-background space-y-4 rounded-2xl p-1"
        variants={contenedor}
        initial={reducir ? false : 'oculto'}
        animate="visible"
      >
        {/* Cabecera, como la lámina de COVINCA */}
        <motion.div
          variants={pieza}
          className="from-primary relative overflow-hidden rounded-2xl bg-gradient-to-br to-[color-mix(in_oklch,var(--primary)_70%,black)] px-5 py-5 text-white sm:px-7"
        >
          <BrilloDeFondo />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold tracking-[0.18em] text-white/70 uppercase">Seguimiento de PCI</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-[30px]">
                {titulo} <span className="text-white/45">|</span> ESTADO SITUACIONAL
              </h2>
              {pci.title && <p className="mt-1 max-w-3xl text-[13px] text-white/80">{pci.title}</p>}
            </div>
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold backdrop-blur">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--sem-verde)] opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-[var(--sem-verde)]" />
                </span>
                Corte: {fmtDate(corte)}
              </span>
              <span className="text-[12px] text-white/70">
                Notificado el {fmtDate(pci.notified_on)}
                {pci.registered_on && <> · registrado el {fmtDate(pci.registered_on)}</>}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Cifras */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi icon={ListChecks} etiqueta="Total de ítems" tono="var(--primary)">
            <Cifra valor={e.total} />
          </Kpi>
          <Kpi icon={CircleCheck} etiqueta="Atendidos" tono="var(--success)">
            <Cifra valor={e.atendidos} />
          </Kpi>
          <Kpi icon={Hourglass} etiqueta="Pendientes" tono="var(--warning)">
            <Cifra valor={e.pendientes} />
          </Kpi>
          <Kpi icon={Gauge} etiqueta="Avance" tono="var(--chart-1)" pie={<Barra valor={e.avance} color="var(--chart-1)" alto={6} />}>
            <Cifra valor={e.avance} decimales={1} sufijo="%" />
          </Kpi>
          <Kpi icon={MapPin} etiqueta="Sectores que intervienen" tono="var(--chart-3)" pie={
            <div className="flex flex-wrap gap-1">
              {e.sectores.map((s) => (
                <span key={s} className="rounded-md bg-[color-mix(in_oklch,var(--chart-3)_14%,transparent)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--chart-3)]">
                  {s}
                </span>
              ))}
            </div>
          }>
            <Cifra valor={e.sectores.length} />
          </Kpi>
          {e.vencidos > 0 ? (
            <Kpi icon={OctagonAlert} etiqueta="Vencidos sin atender" tono="var(--destructive)" alerta>
              <Cifra valor={e.vencidos} />
            </Kpi>
          ) : (
            <Kpi icon={ShieldCheck} etiqueta="Vencidos sin atender" tono="var(--success)" pie={<span className="text-[11.5px] font-semibold text-[var(--success)]">Sin vencidos</span>}>
              <Cifra valor={0} />
            </Kpi>
          )}
        </div>

        {/* La franja de vencimientos */}
        <motion.div variants={pieza} className="flex flex-wrap gap-2">
          <Chip color="var(--warning)" icon={Hourglass}>
            Pendientes en plazo <b className="tabular-nums">{fmtNumber(e.enPlazo)}</b>
          </Chip>
          <Chip color="var(--chart-2)" icon={Clock} vivo={e.venceHoy > 0}>
            Vencen hoy <b className="tabular-nums">{fmtNumber(e.venceHoy)}</b>
          </Chip>
          {e.proximos.slice(0, 4).map((x) => (
            <Chip key={x.fecha} color="var(--chart-1)" icon={CalendarClock}>
              Vencen el {diaMes(x.fecha)} <b className="tabular-nums">{fmtNumber(x.pendientes)}</b>
            </Chip>
          ))}
          {e.vencidos > 0 && (
            <Chip color="var(--destructive)" icon={OctagonAlert} vivo>
              Vencidos <b className="tabular-nums">{fmtNumber(e.vencidos)}</b>
            </Chip>
          )}
        </motion.div>

        {/* Barras por plazo y anillo */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel titulo="Avance por plazo" icon={Layers} className="lg:col-span-2" nota="Atendidos y pendientes de cada plazo, con su fecha de vencimiento">
            <BarrasPorPlazo plazos={e.plazos} corte={corte} />
          </Panel>
          <Panel titulo="Situación de los ítems" icon={Gauge}>
            <Dona estado={e} />
          </Panel>
        </div>

        {/* Tabla por plazo y observación operativa */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel titulo="Plazos y vencimientos" icon={CalendarClock}>
            <TablaPlazos plazos={e.plazos} corte={corte} />
          </Panel>
          <Panel titulo="Observación operativa" icon={Sparkles} nota="Se escribe sola con los datos del corte">
            <ul className="space-y-2">
              {e.observaciones.map((o, i) => (
                <motion.li
                  key={corte + i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.07, duration: 0.4, ease: SUAVE }}
                  className="flex gap-2.5 text-[13px] leading-snug"
                >
                  <span className="bg-primary mt-[7px] size-1.5 shrink-0 rounded-full" />
                  <span>{o}</span>
                </motion.li>
              ))}
            </ul>
          </Panel>
        </div>

        {/* Resumen por sector */}
        <Panel titulo="Resumen por sector" icon={MapPin}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {e.porSector.map((s, i) => (
              <motion.div
                key={s.sector}
                whileHover={{ y: -2 }}
                className="border-border bg-background/60 rounded-xl border p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  {/* Sin sector que lo contenga queda el código del tramo (AQP-01) */}
                  <span className="text-[15px] font-bold">{/^[A-Z]{2,}-/.test(s.sector) ? 'Tramo' : 'Sector'} {s.sector}</span>
                  <span className="text-muted-foreground text-[11.5px] tabular-nums">{fmtNumber(s.total)} ítems</span>
                </div>
                <div className="mt-2">
                  <Barra valor={s.avance} color={s.vencidos ? 'var(--destructive)' : 'var(--success)'} alto={8} retraso={0.1 + i * 0.05} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11.5px]">
                  <span className="text-[var(--success)] font-semibold tabular-nums">{fmtNumber(s.atendidos)} atendidos</span>
                  <span className="text-muted-foreground tabular-nums">
                    {fmtNumber(s.pendientes)} pend.{s.vencidos > 0 && <b className="text-destructive"> · {s.vencidos} venc.</b>}
                  </span>
                  <span className="font-bold tabular-nums">{s.avance.toFixed(0)}%</span>
                </div>
              </motion.div>
            ))}
          </div>
        </Panel>

        <motion.p variants={pieza} className="text-muted-foreground px-1 text-[11.5px]">
          Fuente: SIGOV · registro fotográfico de las cuadrillas, corte {fmtDate(corte)}. Atendido: ítem con sus fotos de
          antes, durante y después (levantado, subsanado o validado) hasta el día de corte.
        </motion.p>
      </motion.div>
    )
  }
)

// ─── Piezas ──────────────────────────────────────────────────────────────

/** Una cifra que corre desde su valor anterior: al cambiar el corte se ve el cambio. */
function Cifra({ valor, decimales = 0, sufijo = '' }: { valor: number; decimales?: number; sufijo?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const previo = React.useRef(0)
  const reducir = useReducedMotion()
  const formato = React.useCallback((v: number) => fmtNumber(v, decimales) + sufijo, [decimales, sufijo])
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const desde = previo.current
    previo.current = valor
    if (reducir) {
      el.textContent = formato(valor)
      return
    }
    const control = animate(desde, valor, { duration: 1.1, ease: SUAVE, onUpdate: (v) => { el.textContent = formato(v) } })
    return () => control.stop()
  }, [valor, reducir, formato])
  return <span ref={ref} className="tabular-nums">{formato(0)}</span>
}

function Kpi({
  icon: Icon, etiqueta, tono, alerta, pie, children,
}: {
  icon: React.ComponentType<{ className?: string }>
  etiqueta: string
  tono: string
  alerta?: boolean
  pie?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <motion.div
      variants={pieza}
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className={cn(
        'bg-card relative overflow-hidden rounded-2xl border p-4 shadow-xs transition-shadow hover:shadow-md',
        alerta ? 'border-destructive/50' : 'border-border'
      )}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: tono }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-[11.5px] leading-tight font-semibold tracking-wide uppercase">{etiqueta}</span>
        <span
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', alerta && 'animate-pulse motion-reduce:animate-none')}
          style={{ background: `color-mix(in oklch, ${tono} 14%, transparent)`, color: tono }}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-2 text-[30px] leading-none font-extrabold tracking-tight" style={{ color: tono }}>
        {children}
      </div>
      {pie && <div className="mt-2.5">{pie}</div>}
    </motion.div>
  )
}

function Chip({
  color, icon: Icon, vivo, children,
}: { color: string; icon: React.ComponentType<{ className?: string }>; vivo?: boolean; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px]"
      style={{ borderColor: `color-mix(in oklch, ${color} 40%, transparent)`, background: `color-mix(in oklch, ${color} 10%, transparent)` }}
    >
      <span className="relative flex" style={{ color }}>
        {vivo && <span className="absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:animate-none" style={{ background: color }} />}
        <Icon className="relative size-3.5" />
      </span>
      <span className="flex items-center gap-1.5">{children}</span>
    </span>
  )
}

function Panel({
  titulo, icon: Icon, nota, className, children,
}: { titulo: string; icon: React.ComponentType<{ className?: string }>; nota?: string; className?: string; children: React.ReactNode }) {
  return (
    <motion.section variants={pieza} className={cn('bg-card border-border min-w-0 rounded-2xl border p-4 sm:p-5', className)}>
      <header className="mb-4 flex items-start gap-2.5">
        <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" />
        </span>
        <div>
          <h3 className="text-[15px] font-bold tracking-tight">{titulo}</h3>
          {nota && <p className="text-muted-foreground text-[11.5px]">{nota}</p>}
        </div>
      </header>
      {children}
    </motion.section>
  )
}

/** Una barra que se llena; al cambiar el valor se desliza hasta el nuevo. */
function Barra({ valor, color, alto = 8, retraso = 0.2 }: { valor: number; color: string; alto?: number; retraso?: number }) {
  const reducir = useReducedMotion()
  return (
    <div className="bg-secondary w-full overflow-hidden rounded-full" style={{ height: alto }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={reducir ? false : { width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, valor))}%` }}
        transition={{ duration: 1, delay: retraso, ease: SUAVE }}
      />
    </div>
  )
}

function BarrasPorPlazo({ plazos, corte }: { plazos: EstadoSituacional['plazos']; corte: string }) {
  const reducir = useReducedMotion()
  const maximo = Math.max(1, ...plazos.map((p) => p.total))
  if (!plazos.length) return <p className="text-muted-foreground text-[13px]">Sin ítems.</p>
  return (
    <div className="space-y-3.5">
      {plazos.map((g, i) => {
        const largo = (g.total / maximo) * 100
        const vencido = g.vencidos > 0
        const terminado = g.pendientes === 0
        return (
          <div key={g.clave} className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-3 sm:grid-cols-[11rem_1fr_auto]">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">Plazo {plazoTexto(g.plazo)}</p>
              <p className={cn('text-[11px]', vencido ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                {g.vence ? (g.vence < corte ? 'venció' : g.vence === corte ? 'vence hoy' : 'vence') + ' el ' + diaMes(g.vence) : 'sin vencimiento'}
              </p>
            </div>
            <div className="bg-secondary/60 h-8 overflow-hidden rounded-lg">
              <motion.div
                className="flex h-full"
                initial={reducir ? false : { width: 0 }}
                animate={{ width: `${largo}%` }}
                transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: SUAVE }}
              >
                {g.atendidos > 0 && (
                  <div
                    className="flex h-full items-center justify-center bg-[var(--success)] text-[11.5px] font-bold text-white"
                    style={{ width: `${(g.atendidos / g.total) * 100}%` }}
                    title={`${g.atendidos} atendidos`}
                  >
                    {g.atendidos / g.total > 0.08 && fmtNumber(g.atendidos)}
                  </div>
                )}
                {g.pendientes > 0 && (
                  <div
                    className="flex h-full items-center justify-center text-[11.5px] font-bold text-white"
                    style={{
                      width: `${(g.pendientes / g.total) * 100}%`,
                      background: vencido
                        ? 'var(--destructive)'
                        : 'repeating-linear-gradient(135deg, var(--warning) 0 8px, color-mix(in oklch, var(--warning) 82%, white) 8px 16px)',
                    }}
                    title={`${g.pendientes} pendientes`}
                  >
                    {g.pendientes / g.total > 0.08 && fmtNumber(g.pendientes)}
                  </div>
                )}
              </motion.div>
            </div>
            <div className="w-16 text-right">
              <p className="text-[13px] font-bold tabular-nums">{fmtNumber(g.total)}</p>
              <p className={cn('text-[11px] font-semibold tabular-nums', terminado ? 'text-[var(--success)]' : 'text-muted-foreground')}>
                {terminado ? 'completo' : `${g.avance.toFixed(0)}%`}
              </p>
            </div>
          </div>
        )
      })}
      <div className="text-muted-foreground flex flex-wrap gap-4 pt-1 text-[11.5px]">
        <Leyenda color="var(--success)">Atendidos</Leyenda>
        <Leyenda color="var(--warning)">Pendientes en plazo</Leyenda>
        <Leyenda color="var(--destructive)">Pendientes vencidos</Leyenda>
      </div>
    </div>
  )
}

function Leyenda({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color }} />
      {children}
    </span>
  )
}

/** El anillo: atendidos, en plazo y vencidos, que se dibuja tramo por tramo. */
function Dona({ estado: e }: { estado: EstadoSituacional }) {
  const reducir = useReducedMotion()
  const tam = 200
  const grosor = 22
  const r = (tam - grosor) / 2
  const C = 2 * Math.PI * r
  const partes = [
    { clave: 'atendido', n: e.atendidos, color: 'var(--success)', label: 'Atendidos' },
    { clave: 'en_plazo', n: e.enPlazo, color: 'var(--warning)', label: 'Pendientes en plazo' },
    { clave: 'vencido', n: e.vencidos, color: 'var(--destructive)', label: 'Vencidos' },
  ]
  let acumulado = 0
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: tam, height: tam }}>
        <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} role="img" aria-label={`Avance ${e.avance.toFixed(1)} por ciento`}>
          <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="var(--secondary)" strokeWidth={grosor} />
          <g transform={`rotate(-90 ${tam / 2} ${tam / 2})`}>
            {partes.map((p, i) => {
              const largo = e.total ? (p.n / e.total) * C : 0
              const desde = acumulado
              acumulado += largo
              if (!largo) return null
              return (
                <motion.circle
                  key={p.clave}
                  cx={tam / 2}
                  cy={tam / 2}
                  r={r}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={grosor}
                  strokeDashoffset={-desde}
                  initial={reducir ? false : { strokeDasharray: `0 ${C}` }}
                  animate={{ strokeDasharray: `${Math.max(0, largo - (partes.filter((x) => x.n).length > 1 ? 2 : 0))} ${C}` }}
                  transition={{ duration: 0.9, delay: 0.2 + i * 0.55, ease: SUAVE }}
                />
              )
            })}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[38px] leading-none font-extrabold tracking-tight text-[var(--success)]">
            <Cifra valor={e.avance} decimales={1} sufijo="%" />
          </span>
          <span className="text-muted-foreground mt-1 text-[11.5px] font-medium">de avance</span>
        </div>
      </div>
      <div className="w-full space-y-1.5">
        {partes.map((p) => (
          <div key={p.clave} className="flex items-center justify-between text-[12.5px]">
            <Leyenda color={p.color}>{p.label}</Leyenda>
            <span className="font-semibold tabular-nums">
              {fmtNumber(p.n)} <span className="text-muted-foreground font-normal">· {e.total ? ((p.n / e.total) * 100).toFixed(1) : '0.0'}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TablaPlazos({ plazos, corte }: { plazos: EstadoSituacional['plazos']; corte: string }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[30rem] text-[12.5px]">
        <thead>
          <tr className="text-muted-foreground border-border border-b text-left text-[11px] tracking-wide uppercase">
            <th className="px-1 py-2 font-semibold">Plazo</th>
            <th className="px-1 py-2 font-semibold">Vencimiento</th>
            <th className="px-1 py-2 text-right font-semibold">Total</th>
            <th className="px-1 py-2 text-right font-semibold">Atendidos</th>
            <th className="px-1 py-2 text-right font-semibold">Pendientes</th>
            <th className="w-32 px-1 py-2 font-semibold">Avance</th>
          </tr>
        </thead>
        <tbody>
          {plazos.map((g, i) => (
            <tr key={g.clave} className="border-border/60 hover:bg-secondary/40 border-b transition-colors last:border-0">
              <td className="px-1 py-2 font-semibold">{plazoTexto(g.plazo)}</td>
              <td className={cn('px-1 py-2 tabular-nums', g.vencidos > 0 && 'text-destructive font-semibold')}>
                {fmtDate(g.vence)}
                {g.vence === corte && <span className="ml-1.5 rounded bg-[var(--chart-2)]/15 px-1 text-[10px] font-bold text-[var(--chart-2)]">HOY</span>}
              </td>
              <td className="px-1 py-2 text-right font-semibold tabular-nums">{fmtNumber(g.total)}</td>
              <td className="px-1 py-2 text-right text-[var(--success)] tabular-nums">{fmtNumber(g.atendidos)}</td>
              <td className={cn('px-1 py-2 text-right tabular-nums', g.vencidos ? 'text-destructive font-semibold' : g.pendientes ? '' : 'text-muted-foreground')}>
                {fmtNumber(g.pendientes)}
              </td>
              <td className="px-1 py-2">
                <div className="flex items-center gap-2">
                  <Barra valor={g.avance} color={g.vencidos ? 'var(--destructive)' : 'var(--success)'} alto={6} retraso={0.3 + i * 0.06} />
                  <span className="w-9 text-right text-[11.5px] font-bold tabular-nums">{g.avance.toFixed(0)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Un brillo que cruza la cabecera muy despacio: la lámina se siente viva sin distraer. */
function BrilloDeFondo() {
  const reducir = useReducedMotion()
  return (
    <>
      <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 size-48 rounded-full bg-[var(--chart-2)]/25 blur-3xl" />
      {!reducir && (
        <motion.div
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          initial={{ x: '-120%' }}
          animate={{ x: '360%' }}
          transition={{ duration: 3.2, delay: 0.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 6 }}
        />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// El detalle, en pantalla (en el PDF va como tabla aparte)
// ═══════════════════════════════════════════════════════════════════════════

function Detalle({ filas }: { filas: FilaEstado[] }) {
  const [filtro, setFiltro] = React.useState<Situacion | 'todos'>('todos')
  const [orden, setOrden] = React.useState<'item' | 'km_asc' | 'km_desc' | 'vence'>('km_asc')

  const cuantos = React.useMemo(() => {
    const acc: Record<string, number> = {}
    for (const f of filas) acc[f.situacion] = (acc[f.situacion] ?? 0) + 1
    return acc
  }, [filas])

  const visibles = React.useMemo(() => {
    let r = filtro === 'todos' ? filas : filas.filter((f) => f.situacion === filtro)
    const km = (f: FilaEstado, sinDato: number) => (f.prog_start_m == null ? sinDato : Number(f.prog_start_m))
    const porItem = (a: FilaEstado, b: FilaEstado) => (a.item_number ?? 0) - (b.item_number ?? 0)
    r = [...r]
    if (orden === 'km_asc') r.sort((a, b) => km(a, Infinity) - km(b, Infinity) || porItem(a, b))
    else if (orden === 'km_desc') r.sort((a, b) => km(b, -Infinity) - km(a, -Infinity) || porItem(a, b))
    else if (orden === 'vence') r.sort((a, b) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999')) || porItem(a, b))
    else r.sort(porItem)
    return r
  }, [filas, filtro, orden])

  return (
    <Card className="overflow-hidden">
      <div className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h3 className="mr-2 text-[15px] font-bold tracking-tight">Detalle de ítems</h3>
        {(['todos', 'atendido', 'en_plazo', 'vence_hoy', 'vencido'] as const).map((k) => {
          const n = k === 'todos' ? filas.length : cuantos[k] ?? 0
          if (k !== 'todos' && !n) return null
          return (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-all',
                filtro === k ? 'border-primary bg-primary/8' : 'border-border hover:border-primary/30'
              )}
            >
              {k !== 'todos' && <span className="size-2 rounded-full" style={{ background: SITUACION[k].color }} />}
              {k === 'todos' ? 'Todos' : SITUACION[k].label}
              <b className="tabular-nums">{n}</b>
            </button>
          )
        })}
        <Select value={orden} onValueChange={(v) => setOrden(v as typeof orden)}>
          <SelectTrigger size="sm" className="ml-auto w-56" aria-label="Ordenar">
            <ArrowUpDown className="text-muted-foreground size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="km_asc">Por km, de menor a mayor</SelectItem>
            <SelectItem value="km_desc">Por km, de mayor a menor</SelectItem>
            <SelectItem value="item">Por n.º de ítem</SelectItem>
            <SelectItem value="vence">Por vencimiento</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full min-w-[52rem] text-[12.5px]">
          <thead className="bg-muted/60 text-muted-foreground sticky top-0 z-10 text-left text-[11px] tracking-wide uppercase backdrop-blur">
            <tr>
              <th className="px-3 py-2 text-right font-semibold">N.º</th>
              <th className="px-3 py-2 font-semibold">Sector</th>
              <th className="px-3 py-2 font-semibold">Progresiva</th>
              <th className="px-3 py-2 font-semibold">Actividad / descripción</th>
              <th className="px-3 py-2 font-semibold">Plazo</th>
              <th className="px-3 py-2 font-semibold">Vence</th>
              <th className="px-3 py-2 font-semibold">Situación</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id} className="border-border/60 hover:bg-secondary/40 border-b transition-colors">
                <td className="text-muted-foreground px-3 py-2 text-right font-mono tabular-nums">{f.item_number}</td>
                <td className="px-3 py-2 font-semibold">{f.sector}</td>
                <td className="px-3 py-2 tabular-nums">{f.prog_start_txt ?? '—'}</td>
                <td className="max-w-[28rem] px-3 py-2">
                  <span className="block truncate font-medium">{f.activity_name ?? 'Sin actividad asignada'}</span>
                  <span className="text-muted-foreground block truncate text-[11px]">{truncate(f.description, 120)}</span>
                </td>
                <td className="px-3 py-2">{plazoTexto(f.term_days)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtDate(f.due_date)}</td>
                <td className="px-3 py-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-semibold"
                    style={{ color: SITUACION[f.situacion].color, background: `color-mix(in oklch, ${SITUACION[f.situacion].color} 13%, transparent)` }}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: SITUACION[f.situacion].color }} />
                    {SITUACION[f.situacion].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Esqueleto() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  )
}
