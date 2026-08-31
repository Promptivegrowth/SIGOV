'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  FileBarChart, FileText, FileSpreadsheet, HardHat, TriangleAlert,
  ShieldCheck, Ruler, Boxes, Loader2, CircleCheck,
} from 'lucide-react'
import { createClient, fetchAll } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DateRangeTabs, rangeFromPreset, type DatePresetKey } from '@/components/shared/misc'
import { descargarPdf, descargarExcel, type ReportMeta } from '@/lib/reports'
import { cn, fmtDate, fmtNumber, fmtProgresiva, truncate } from '@/lib/utils'
import { SEMAFORO } from '@/lib/constants'
import { toast } from 'sonner'

type ReportKey = 'diario' | 'metrados' | 'pci' | 'ssoma' | 'inventario'

interface ReportDef {
  key: ReportKey
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  module?: string
  tone: string
}

const REPORTS: ReportDef[] = [
  { key: 'diario', label: 'Reporte diario de ejecución', description: 'Actividades ejecutadas por cuadrilla, con progresivas, metrados y conteo de evidencias.', icon: HardHat, module: 'campo', tone: 'var(--chart-1)' },
  { key: 'metrados', label: 'Resumen de metrados', description: 'Metrado acumulado por actividad y unidad, contra la meta programada.', icon: Ruler, module: 'programacion', tone: 'var(--chart-4)' },
  { key: 'pci', label: 'Reporte de PCIs', description: 'Ítems con su plazo, semáforo de vencimiento, responsable y estado de levantamiento.', icon: TriangleAlert, module: 'pci', tone: 'var(--sem-rojo)' },
  { key: 'ssoma', label: 'Reporte SSOMA', description: 'Charlas, asistencia firmada, checklists con hallazgos y ATS/IPERC del periodo.', icon: ShieldCheck, module: 'ssoma', tone: 'var(--chart-3)' },
  { key: 'inventario', label: 'Inventario vial', description: 'Elementos por tipo, tramo y progresiva, con estado de conservación e inspecciones.', icon: Boxes, module: 'inventario', tone: 'var(--chart-2)' },
]

export function ReportesClient() {
  const { service, profile, hasModule } = useSession()
  const sb = React.useMemo(() => createClient(), [])
  const [preset, setPreset] = React.useState<DatePresetKey>('30d')
  const [busy, setBusy] = React.useState<string | null>(null)
  const range = React.useMemo(() => rangeFromPreset(preset), [preset])

  const available = REPORTS.filter((r) => !r.module || hasModule(r.module))

  const meta = (titulo: string, subtitulo?: string): ReportMeta => ({
    titulo,
    subtitulo,
    servicio: service.name,
    cliente: service.client_name,
    contrato: service.contract_code,
    periodo: `Del ${fmtDate(range.from)} al ${fmtDate(range.to)}`,
    generadoPor: profile.full_name,
  })

  // ── Consultas por reporte ─────────────────────────────────────────────
  const fetchData = async (key: ReportKey) => {
    switch (key) {
      case 'diario': {
        // Un periodo largo supera las 1 000 filas que devuelve PostgREST
        return await fetchAll((from, to) =>
          sb.from('v_work_entries')
            .select('*')
            .eq('service_id', service.id)
            .gte('work_date', range.from)
            .lte('work_date', range.to)
            .order('work_date', { ascending: false })
            .order('id')
            .range(from, to)
        )
      }
      case 'metrados': {
        const { data } = await sb.rpc('dashboard_activity_production', {
          p_service_id: service.id, p_from: range.from, p_to: range.to,
        })
        return (data ?? []) as any[]
      }
      case 'pci': {
        const { data } = await sb
          .from('v_pci_items')
          .select('*')
          .eq('service_id', service.id)
          .order('due_date')
        return data ?? []
      }
      case 'ssoma': {
        const [talks, checks, ats] = await Promise.all([
          sb.from('safety_talks').select('*, crews(name)').eq('service_id', service.id)
            .gte('talk_date', range.from).lte('talk_date', range.to).is('deleted_at', null),
          sb.from('checklist_responses').select('*, checklist_templates(name), crews(name)')
            .eq('service_id', service.id).gte('responded_on', range.from).lte('responded_on', range.to).is('deleted_at', null),
          sb.from('ats_iperc').select('*, crews(name)').eq('service_id', service.id)
            .gte('doc_date', range.from).lte('doc_date', range.to).is('deleted_at', null),
        ])
        return { talks: talks.data ?? [], checks: checks.data ?? [], ats: ats.data ?? [] } as any
      }
      case 'inventario': {
        const { data } = await sb
          .from('v_road_assets')
          .select('*')
          .eq('service_id', service.id)
          .order('section_name')
          .order('progresiva_m')
        return data ?? []
      }
    }
  }

  const generate = async (key: ReportKey, format: 'pdf' | 'excel') => {
    setBusy(`${key}-${format}`)
    try {
      const data: any = await fetchData(key)
      const stamp = new Date().toISOString().slice(0, 10)

      if (key === 'diario') {
        const cols = [
          { header: 'Fecha', key: 'fecha', width: 12 },
          { header: 'Cuadrilla', key: 'cuadrilla', width: 26 },
          { header: 'Actividad', key: 'actividad', width: 38 },
          { header: 'Tramo', key: 'tramo', width: 24 },
          { header: 'Progresiva', key: 'progresiva', width: 20 },
          { header: 'Metrado', key: 'metrado', align: 'right' as const, width: 12 },
          { header: 'Und', key: 'unidad', width: 8 },
          { header: 'Fotos', key: 'fotos', align: 'center' as const, width: 8 },
        ]
        const rows = data.map((e: any) => ({
          fecha: fmtDate(e.work_date),
          cuadrilla: e.crew_name ?? '—',
          actividad: e.activity_name,
          tramo: e.section_name,
          progresiva: `${fmtProgresiva(e.prog_start_m)} - ${fmtProgresiva(e.prog_end_m)}`,
          metrado: fmtNumber(e.quantity, 1),
          unidad: e.unit_symbol ?? '',
          fotos: e.evidence_count,
        }))
        const totalMetrado = data.reduce((s: number, e: any) => s + Number(e.quantity ?? 0), 0)
        const totalFotos = data.reduce((s: number, e: any) => s + Number(e.evidence_count ?? 0), 0)

        if (format === 'pdf') {
          await descargarPdf(`SIGOV_reporte_diario_${stamp}`, meta('Reporte diario de ejecución'), cols, rows, {
            landscape: true,
            kpis: [
              { label: 'Registros', value: fmtNumber(data.length) },
              { label: 'Metrado total', value: fmtNumber(totalMetrado, 1) },
              { label: 'Evidencias', value: fmtNumber(totalFotos) },
              { label: 'Cuadrillas', value: fmtNumber(new Set(data.map((e: any) => e.crew_name)).size) },
            ],
          })
        } else {
          await descargarExcel(`SIGOV_reporte_diario_${stamp}`, meta('Reporte diario de ejecución'), [
            { name: 'Ejecución', columns: cols, rows },
          ])
        }
      }

      if (key === 'metrados') {
        const cols = [
          { header: 'Actividad', key: 'actividad', width: 40 },
          { header: 'Categoría', key: 'categoria', width: 20 },
          { header: 'Und', key: 'unidad', width: 8 },
          { header: 'Meta', key: 'meta', align: 'right' as const, width: 14 },
          { header: 'Ejecutado', key: 'ejecutado', align: 'right' as const, width: 14 },
          { header: 'Cumplimiento', key: 'cumplimiento', align: 'right' as const, width: 14 },
          { header: 'Registros', key: 'registros', align: 'right' as const, width: 12 },
        ]
        const rows = data.map((a: any) => {
          const meta_ = Number(a.meta) || 0
          const ej = Number(a.metrado) || 0
          return {
            actividad: a.activity_name,
            categoria: a.category ?? '—',
            unidad: a.unit_symbol ?? '',
            meta: fmtNumber(meta_, 1),
            ejecutado: fmtNumber(ej, 1),
            cumplimiento: meta_ ? `${((ej / meta_) * 100).toFixed(1)}%` : '—',
            registros: a.registros,
          }
        })
        format === 'pdf'
          ? await descargarPdf(`SIGOV_metrados_${stamp}`, meta('Resumen de metrados'), cols, rows, { landscape: true })
          : await descargarExcel(`SIGOV_metrados_${stamp}`, meta('Resumen de metrados'), [{ name: 'Metrados', columns: cols, rows }])
      }

      if (key === 'pci') {
        const cols = [
          { header: 'PCI', key: 'pci', width: 16 },
          { header: 'Ítem', key: 'item', align: 'right' as const, width: 8 },
          { header: 'Descripción', key: 'descripcion', width: 60 },
          { header: 'Tramo', key: 'tramo', width: 22 },
          { header: 'Progresiva', key: 'progresiva', width: 14 },
          { header: 'Plazo', key: 'plazo', align: 'right' as const, width: 10 },
          { header: 'Vence', key: 'vence', width: 12 },
          { header: 'Semáforo', key: 'semaforo', width: 14 },
          { header: 'Estado', key: 'estado', width: 14 },
          { header: 'Fotos', key: 'fotos', align: 'center' as const, width: 8 },
        ]
        const rows = data.map((i: any) => ({
          pci: i.pci_code,
          item: i.item_number,
          descripcion: truncate(i.description, 120),
          tramo: i.section_name ?? '—',
          progresiva: i.prog_start_txt ?? '—',
          plazo: `${i.term_days} d`,
          vence: fmtDate(i.due_date),
          semaforo: SEMAFORO[i.semaforo as keyof typeof SEMAFORO]?.label ?? i.semaforo,
          estado: i.status,
          fotos: i.evidence_count,
        }))
        const vencidos = data.filter((i: any) => i.semaforo === 'vencido').length
        const levantados = data.filter((i: any) => i.semaforo === 'ok').length

        format === 'pdf'
          ? await descargarPdf(`SIGOV_pci_${stamp}`, meta('Reporte de PCIs · OSITRAN'), cols, rows, {
              landscape: true,
              kpis: [
                { label: 'Ítems totales', value: fmtNumber(data.length) },
                { label: 'Levantados', value: fmtNumber(levantados) },
                { label: 'Vencidos', value: fmtNumber(vencidos) },
                { label: 'Cumplimiento', value: `${data.length ? ((levantados / data.length) * 100).toFixed(1) : 0}%` },
              ],
            })
          : await descargarExcel(`SIGOV_pci_${stamp}`, meta('Reporte de PCIs · OSITRAN'), [{ name: 'Items PCI', columns: cols, rows }])
      }

      if (key === 'ssoma') {
        const talkCols = [
          { header: 'Fecha', key: 'fecha', width: 12 },
          { header: 'Tema', key: 'tema', width: 50 },
          { header: 'Cuadrilla', key: 'cuadrilla', width: 26 },
          { header: 'Expositor', key: 'expositor', width: 26 },
          { header: 'Asistentes', key: 'asistentes', align: 'right' as const, width: 12 },
        ]
        const talkRows = data.talks.map((t: any) => ({
          fecha: fmtDate(t.talk_date), tema: t.topic,
          cuadrilla: t.crews?.name ?? '—', expositor: t.speaker_name,
          asistentes: t.attendees_count,
        }))
        const checkCols = [
          { header: 'Fecha', key: 'fecha', width: 12 },
          { header: 'Checklist', key: 'checklist', width: 34 },
          { header: 'Cuadrilla', key: 'cuadrilla', width: 26 },
          { header: 'Puntaje', key: 'puntaje', align: 'right' as const, width: 10 },
          { header: 'Hallazgos', key: 'hallazgos', width: 50 },
        ]
        const checkRows = data.checks.map((c: any) => ({
          fecha: fmtDate(c.responded_on),
          checklist: c.checklist_templates?.name ?? '—',
          cuadrilla: c.crews?.name ?? '—',
          puntaje: `${Number(c.score).toFixed(1)}%`,
          hallazgos: c.findings ?? '—',
        }))
        const atsCols = [
          { header: 'Fecha', key: 'fecha', width: 12 },
          { header: 'Tarea', key: 'tarea', width: 44 },
          { header: 'Ubicación', key: 'ubicacion', width: 34 },
          { header: 'Riesgo máx.', key: 'riesgo', width: 14 },
          { header: 'Peligros', key: 'peligros', align: 'right' as const, width: 10 },
        ]
        const atsRows = data.ats.map((a: any) => ({
          fecha: fmtDate(a.doc_date), tarea: a.task,
          ubicacion: a.location ?? '—', riesgo: a.max_risk,
          peligros: (a.hazards ?? []).length,
        }))

        if (format === 'pdf') {
          await descargarPdf(`SIGOV_ssoma_${stamp}`, meta('Reporte SSOMA', 'Charlas de seguridad'), talkCols, talkRows, {
            kpis: [
              { label: 'Charlas', value: fmtNumber(data.talks.length) },
              { label: 'Asistencias', value: fmtNumber(data.talks.reduce((s: number, t: any) => s + t.attendees_count, 0)) },
              { label: 'Checklists', value: fmtNumber(data.checks.length) },
              { label: 'ATS / IPERC', value: fmtNumber(data.ats.length) },
            ],
          })
        } else {
          await descargarExcel(`SIGOV_ssoma_${stamp}`, meta('Reporte SSOMA'), [
            { name: 'Charlas', columns: talkCols, rows: talkRows },
            { name: 'Checklists', columns: checkCols, rows: checkRows },
            { name: 'ATS IPERC', columns: atsCols, rows: atsRows },
          ])
        }
      }

      if (key === 'inventario') {
        const cols = [
          { header: 'Código', key: 'codigo', width: 18 },
          { header: 'Tipo', key: 'tipo', width: 24 },
          { header: 'Elemento', key: 'nombre', width: 34 },
          { header: 'Tramo', key: 'tramo', width: 24 },
          { header: 'Progresiva', key: 'progresiva', width: 14 },
          { header: 'Lado', key: 'lado', width: 12 },
          { header: 'Estado', key: 'estado', width: 14 },
          { header: 'Últ. inspección', key: 'inspeccion', width: 14 },
        ]
        const rows = data.map((a: any) => ({
          codigo: a.code, tipo: a.type_name, nombre: a.name ?? '—',
          tramo: a.section_name ?? '—', progresiva: a.progresiva_txt ?? '—',
          lado: a.side, estado: a.condition,
          inspeccion: a.last_inspected_on ? fmtDate(a.last_inspected_on) : '—',
        }))
        format === 'pdf'
          ? await descargarPdf(`SIGOV_inventario_${stamp}`, meta('Inventario vial georreferenciado'), cols, rows, { landscape: true })
          : await descargarExcel(`SIGOV_inventario_${stamp}`, meta('Inventario vial georreferenciado'), [{ name: 'Inventario', columns: cols, rows }])
      }

      toast.success(`Reporte ${format === 'pdf' ? 'PDF' : 'Excel'} generado`)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo generar el reporte')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        icon={FileBarChart}
        title="Reportes y salidas"
        description="Reportes diarios, de PCI, SSOMA, metrados e inventario. Se generan en el navegador y se descargan al instante en PDF con formato o Excel con filtros."
        actions={<DateRangeTabs value={preset} onChange={setPreset} />}
      />

      <PageBody>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {available.map((r, i) => (
            <motion.div
              key={r.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="flex h-full flex-col">
                <CardContent className="flex flex-1 flex-col p-5">
                  <span
                    className="flex size-11 items-center justify-center rounded-xl"
                    style={{ background: `color-mix(in oklch, ${r.tone} 14%, transparent)`, color: r.tone }}
                  >
                    <r.icon className="size-5" />
                  </span>
                  <h3 className="mt-3.5 text-[14.5px] font-semibold leading-snug">{r.label}</h3>
                  <p className="text-muted-foreground mt-1.5 flex-1 text-[12.5px] leading-relaxed">
                    {r.description}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      loading={busy === `${r.key}-pdf`}
                      onClick={() => generate(r.key, 'pdf')}
                    >
                      <FileText className="size-3.5" />
                      PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      loading={busy === `${r.key}-excel`}
                      onClick={() => generate(r.key, 'excel')}
                    >
                      <FileSpreadsheet className="size-3.5" />
                      Excel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <Card className="mt-5">
          <CardContent className="flex items-start gap-3 p-4">
            <CircleCheck className="text-success mt-0.5 size-4 shrink-0" />
            <p className="text-[12.5px] leading-relaxed">
              Los reportes se generan íntegramente en el navegador con los datos del periodo seleccionado,
              por lo que no consumen cuota del servidor y funcionan también con la app instalada.
              El PDF lleva la marca SIGOV, el contrato, el periodo y el pie de página con quién y cuándo lo generó;
              el Excel incluye filtros y formato listos para entregar.
            </p>
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}
