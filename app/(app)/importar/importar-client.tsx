'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  Upload, FileSpreadsheet, ArrowRight, CircleCheck, TriangleAlert,
  Download, X, ArrowLeft, Database, Sparkles, CircleX, History,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/primitives'
import { EmptyState } from '@/components/shared/misc'
import {
  IMPORT_KINDS, autoMap, coerce, normKey,
  type ImportKind, type RowIssue,
} from '@/lib/import-schemas'
import { cn, fmtDate, fmtNumber, fmtRelative, toISODate, parseFecha } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'
import { usePlazosPci, etiquetaPlazo } from '@/lib/hooks/use-plazos-pci'

/** «Detectar el PCI desde la columna del Excel» en vez de elegir uno. */
const PCI_DESDE_EXCEL = '__excel__'

type Step = 'tipo' | 'archivo' | 'mapeo' | 'validacion' | 'resultado'

export function ImportarClient() {
  const { service, profile } = useSession()
  const params = useSearchParams()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const initialKind = (params.get('kind') as ImportKind['key']) || null
  const [kind, setKind] = React.useState<ImportKind['key'] | null>(initialKind)
  const [step, setStep] = React.useState<Step>(initialKind ? 'archivo' : 'tipo')
  const [file, setFile] = React.useState<File | null>(null)
  const [headers, setHeaders] = React.useState<string[]>([])
  const [rows, setRows] = React.useState<any[]>([])
  const [mapping, setMapping] = React.useState<Record<string, string>>({})
  const [issues, setIssues] = React.useState<RowIssue[]>([])
  const [valid, setValid] = React.useState<any[]>([])
  const [importing, setImporting] = React.useState(false)
  const [result, setResult] = React.useState<any>(null)
  const [pciId, setPciId] = React.useState<string>('')
  const { plazos } = usePlazosPci()

  const schema = kind ? IMPORT_KINDS[kind] : null

  // ── Catálogos para resolver lookups ───────────────────────────────────
  const lookups = useQuery({
    queryKey: ['import-lookups', service.id],
    queryFn: async () => {
      const [acts, secs, crews, units, types] = await Promise.all([
        sb.from('activities_catalog').select('id, code, name').eq('service_id', service.id).is('deleted_at', null),
        sb.from('road_sections').select('id, code, name').eq('service_id', service.id).is('deleted_at', null),
        sb.from('crews').select('id, code, name').eq('service_id', service.id).is('deleted_at', null),
        sb.from('units').select('id, code, symbol'),
        sb.from('asset_types').select('id, code, name'),
      ])
      const toMap = (arr: any[], keys: string[]) => {
        const m = new Map<string, string>()
        for (const r of arr ?? []) for (const k of keys) if (r[k]) m.set(normKey(String(r[k])), r.id)
        return m
      }
      return {
        activity: toMap(acts.data ?? [], ['code', 'name']),
        section: toMap(secs.data ?? [], ['code', 'name']),
        crew: toMap(crews.data ?? [], ['code', 'name']),
        unit: toMap(units.data ?? [], ['code', 'symbol']),
        asset_type: toMap(types.data ?? [], ['code', 'name']),
        condition: new Map(
          ['bueno', 'regular', 'malo', 'critico', 'no_evaluado'].map((c) => [normKey(c), c])
        ),
        side: new Map([
          ...['derecho', 'izquierdo', 'ambos', 'eje'].map((c) => [normKey(c), c] as const),
          ...([['ld', 'derecho'], ['d', 'derecho'], ['li', 'izquierdo'], ['i', 'izquierdo'],
              ['ldli', 'ambos'], ['lild', 'ambos'], ['ambos', 'ambos'], ['ldejeli', 'ambos'], ['e', 'eje']] as const),
        ]),
      }
    },
    staleTime: 5 * 60_000,
  })

  const pcis = useQuery({
    queryKey: ['pcis-select', service.id],
    enabled: kind === 'pci',
    queryFn: async () => {
      const { data } = await sb
        .from('pcis')
        .select('id, code, title, notified_on, received_on, default_days, published_at')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .order('notified_on', { ascending: false })
      return data ?? []
    },
  })

  const history = useQuery({
    queryKey: ['import-history', service.id],
    queryFn: async () => {
      const { data } = await sb
        .from('import_batches')
        .select('*')
        .eq('service_id', service.id)
        .order('created_at', { ascending: false })
        .limit(8)
      return data ?? []
    },
  })

  // ── Lectura del archivo ───────────────────────────────────────────────
  const readFile = async (f: File) => {
    setFile(f)
    const XLSX = await import('xlsx')
    const buf = await f.arrayBuffer()
    const wb = XLSX.read(buf, { cellDates: false })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: '', raw: true })
    if (!json.length) {
      toast.error('La hoja está vacía')
      return
    }
    const hs = Object.keys(json[0])
    setHeaders(hs)
    setRows(json)
    setMapping(autoMap(hs, schema!.fields))
    setStep('mapeo')
    toast.success(`${json.length} filas leídas de "${wb.SheetNames[0]}"`)
  }

  // ── Validación fila a fila ────────────────────────────────────────────
  const validate = () => {
    if (!schema || !lookups.data) return
    const problems: RowIssue[] = []
    const ok: any[] = []

    rows.forEach((raw, i) => {
      const out: any = {}
      let rowOk = true
      for (const f of schema.fields) {
        const col = mapping[f.key]
        const cell = col ? raw[col] : null
        const { value, error } = coerce(cell, f, lookups.data as any)
        if (error) {
          problems.push({ row: i + 2, field: f.label, message: error })
          rowOk = false
        }
        out[f.key] = value
      }
      // OBS-08: el plazo es de la lista cerrada del contrato (las carpetas de COVINCA)
      if (schema.key === 'pci' && out.term_days != null && !plazos.includes(Number(out.term_days))) {
        problems.push({
          row: i + 2,
          field: 'Plazo (días)',
          message: `${out.term_days} días no es un plazo del contrato (${plazos.map(etiquetaPlazo).join(', ')})`,
        })
        rowOk = false
      }
      if (schema.key === 'pci' && pciId === PCI_DESDE_EXCEL && !out.pci_code) {
        problems.push({ row: i + 2, field: 'N.º de PCI', message: 'Falta el número de PCI de la fila' })
        rowOk = false
      }
      if (rowOk) ok.push(out)
    })

    setIssues(problems)
    setValid(ok)
    setStep('validacion')
  }

  // ── Importación transaccional ─────────────────────────────────────────
  const runImport = async () => {
    if (!schema) return
    setImporting(true)

    const batch = await sb
      .from('import_batches')
      .insert({
        service_id: service.id,
        kind: schema.key,
        file_name: file?.name ?? null,
        total_rows: rows.length,
        ok_rows: 0,
        error_rows: issues.length,
        status: 'procesando',
        mapping,
        errors: issues.slice(0, 200) as any,
        created_by: profile.id,
      })
      .select('id')
      .single()

    let inserted = 0
    let updated = 0
    let failed = 0
    const errors: any[] = []

    const pcisTocados: { id: string; code: string; nuevo: boolean; publicado: boolean }[] = []
    try {
      // OBS-07: cada fila va al PCI elegido o al de su columna «N.º de PCI»;
      // el PCI que no existe se crea como borrador con la fecha de recepción.
      const destinoDe = new Map<any, any>()
      if (schema.key === 'pci') {
        if (pciId === PCI_DESDE_EXCEL) {
          const codigos = [...new Set(valid.map((v) => String(v.pci_code).trim()))]
          for (const code of codigos) {
            let pci = (pcis.data ?? []).find((p: any) => normKey(p.code) === normKey(code))
            const nuevo = !pci
            if (!pci) {
              const primera = valid.find((v) => String(v.pci_code).trim() === code)
              const recibido = primera?.received_on ?? toISODate(new Date())
              const { data, error } = await sb.from('pcis').insert({
                service_id: service.id,
                code,
                title: /^pci/i.test(code) ? code : `PCI ${code}`,
                notified_on: recibido,
                received_on: recibido,
                default_days: plazos.includes(7) ? 7 : plazos[plazos.length - 1],
                status: 'abierto',
                created_by: profile.id,
              }).select('id, code, title, notified_on, received_on, default_days, published_at').single()
              if (error) throw new Error(`No se pudo crear el PCI ${code}: ${error.message}`)
              pci = data
            }
            pcisTocados.push({ id: pci.id, code: pci.code, nuevo, publicado: !!pci.published_at })
            for (const v of valid) if (String(v.pci_code).trim() === code) destinoDe.set(v, pci)
          }
        } else {
          const pci = (pcis.data ?? []).find((p: any) => p.id === pciId)
          if (pci) pcisTocados.push({ id: pci.id, code: pci.code, nuevo: false, publicado: !!pci.published_at })
          for (const v of valid) destinoDe.set(v, pci)
        }
      }
      const payload = valid.map((v) => buildRow(schema.key, v, service.id, profile.id, destinoDe.get(v)))

      // Tandas a escribir. Lo normal es una sola (upsert de todo). El PCI va
      // aparte: volver a subir el mismo Excel no puede devolver a «pendiente»
      // lo que la cuadrilla ya atendió, levantó o le validaron (OBS-07).
      type Tanda = {
        filas: any[]
        opciones: { onConflict: string; ignoreDuplicates?: boolean; defaultToNull?: boolean }
        nuevas: boolean
      }
      const tandas: Tanda[] = []

      if (schema.key === 'pci') for (const destino of pcisTocados) {
        const delPci = payload.filter((r) => r.pci_id === destino.id)
        const existentes = await numerosDeItemExistentes(sb, destino.id)
        const nuevos = delPci.filter((r) => !existentes.has(r.item_number))
        // Del ítem que ya existe solo se refresca lo que describe el Excel, y
        // solo las columnas que se mapearon: una columna sin asignar no borra
        // lo que ya había. Estado, plazo, vencimiento, cuadrilla, fechas de
        // cierre y validación y evidencias no se tocan.
        const descriptivas = PCI_DESCRIPTIVOS.filter(
          (d) => d.campo === 'description' || mapping[d.origen]
        )
        const viejos = delPci
          .filter((r) => existentes.has(r.item_number))
          .map((r) => {
            // Las NOT NULL viajan igual: Postgres valida la fila propuesta
            // antes de ver que choca con la existente.
            const fila: any = { service_id: r.service_id, pci_id: r.pci_id, item_number: r.item_number }
            for (const d of descriptivas) fila[d.campo] = r[d.campo]
            return fila
          })
        // ignoreDuplicates: si alguien creó el mismo ítem entre la lectura y
        // la escritura, se respeta el suyo en vez de pisarle el estado.
        tandas.push({ filas: nuevos, opciones: { onConflict: 'pci_id,item_number', ignoreDuplicates: true }, nuevas: true })
        // defaultToNull=false: lo que no va en la fila no se escribe como NULL.
        tandas.push({ filas: viejos, opciones: { onConflict: 'pci_id,item_number', defaultToNull: false }, nuevas: false })
        // La cuadrilla del Excel solo se pone a los ítems que no tenían una:
        // reimportar no le quita el trabajo a la cuadrilla que ya lo atiende.
        if (mapping.crew_code) {
          const porCuadrilla = new Map<string, number[]>()
          for (const r of delPci) {
            if (!existentes.has(r.item_number) || !r.assigned_crew_id) continue
            porCuadrilla.set(r.assigned_crew_id, [...(porCuadrilla.get(r.assigned_crew_id) ?? []), r.item_number])
          }
          for (const [crew, numeros] of porCuadrilla) {
            const { error } = await sb.from('pci_items').update({ assigned_crew_id: crew })
              .eq('pci_id', destino.id).in('item_number', numeros).is('assigned_crew_id', null)
            if (error) errors.push({ error: `Cuadrilla de ${destino.code}: ${error.message}` })
          }
        }
      } else {
        tandas.push({ filas: payload, opciones: { onConflict: onConflictFor(schema.key) }, nuevas: true })
      }

      // Lotes de 200 para no exceder el límite del request
      let lote = 0
      for (const t of tandas) {
        for (let i = 0; i < t.filas.length; i += 200) {
          lote++
          const chunk = t.filas.slice(i, i + 200)
          const { error, count } = await sb
            .from(schema.table as any)
            .upsert(chunk, { ...t.opciones, count: 'exact' })
          if (error) {
            failed += chunk.length
            errors.push({ lote, error: error.message })
          } else if (t.nuevas) {
            inserted += count ?? chunk.length
          } else {
            updated += count ?? chunk.length
          }
        }
      }
    } catch (e: any) {
      // Fallo antes o fuera de los lotes (p. ej. al leer los ítems que ya
      // existen): lo que no se llegó a escribir cuenta como fallido.
      failed = Math.max(valid.length - inserted - updated, 0)
      errors.push({ error: e?.message ?? String(e) })
    } finally {
      await sb
        .from('import_batches')
        .update({
          ok_rows: inserted,
          error_rows: issues.length + failed,
          status: failed ? 'fallido' : 'completado',
          errors: [...issues.slice(0, 100), ...errors] as any,
          finished_at: new Date().toISOString(),
        })
        .eq('id', batch.data!.id)

      setResult({ inserted, updated, failed, issues: issues.length, pcis: pcisTocados })
      setImporting(false)
      setStep('resultado')
      qc.invalidateQueries()
      if (!failed) {
        toast.success(
          updated
            ? `${inserted} ${inserted === 1 ? 'registro nuevo' : 'registros nuevos'} · ${updated} ${updated === 1 ? 'actualizado' : 'actualizados'}`
            : `${inserted} ${inserted === 1 ? 'registro importado' : 'registros importados'}`
        )
      } else toast.error(`${failed} registros no se pudieron guardar`)
    }
  }

  const downloadTemplate = async () => {
    if (!schema) return
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(schema.sample)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, schema.label.slice(0, 28))
    XLSX.writeFile(wb, `SIGOV_plantilla_${schema.key}.xlsx`)
  }

  const reset = () => {
    setFile(null); setHeaders([]); setRows([]); setMapping({})
    setIssues([]); setValid([]); setResult(null); setStep(kind ? 'archivo' : 'tipo')
  }

  const requiredMissing = schema?.fields.filter(
    (f) => (f.required || (f.key === 'pci_code' && pciId === PCI_DESDE_EXCEL)) && !mapping[f.key]
  ) ?? []

  return (
    <>
      <PageHeader
        icon={Upload}
        title="Importación desde Excel"
        description="Sube el archivo tal como lo maneja Grupo Servicon. El sistema detecta las columnas, valida fila a fila y muestra los errores antes de escribir nada en la base."
        actions={
          schema && (
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="size-4" />
              Descargar plantilla
            </Button>
          )
        }
      >
        <Steps step={step} />
      </PageHeader>

      <PageBody className="space-y-5">
        <AnimatePresence mode="wait">
          {/* ── 1. Tipo ───────────────────────────────────────────────── */}
          {step === 'tipo' && (
            <motion.div key="tipo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Object.values(IMPORT_KINDS).map((k) => (
                  <button
                    key={k.key}
                    onClick={() => { setKind(k.key); setStep('archivo') }}
                    className="bg-card group flex items-start gap-3.5 rounded-xl border border-border p-4 text-left transition-all hover:border-primary/40 hover:shadow-md"
                  >
                    <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                      <FileSpreadsheet className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{k.label}</span>
                      <span className="text-muted-foreground mt-0.5 block text-[12.5px] leading-snug">
                        {k.description}
                      </span>
                      <span className="text-muted-foreground mt-1.5 block text-[11px]">
                        {k.fields.filter((f) => f.required).length} campos obligatorios
                      </span>
                    </span>
                    <ArrowRight className="text-muted-foreground mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── 2. Archivo ────────────────────────────────────────────── */}
          {step === 'archivo' && schema && (
            <motion.div key="archivo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setKind(null); setStep('tipo') }}>
                  <ArrowLeft className="size-4" />
                  Cambiar tipo
                </Button>
                <Badge variant="secondary">{schema.label}</Badge>
              </div>

              {kind === 'pci' && (
                <Card>
                  <CardContent className="p-4">
                    <p className="mb-2 text-[13px] font-semibold">¿A qué PCI pertenecen estos ítems?</p>
                    <Select value={pciId} onValueChange={setPciId}>
                      <SelectTrigger className="max-w-md">
                        <SelectValue placeholder="Selecciona el PCI…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={PCI_DESDE_EXCEL}>
                          Tomarlo de la columna «N.º de PCI» del Excel (crea los que falten)
                        </SelectItem>
                        {(pcis.data ?? []).map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code} · {p.title.slice(0, 50)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

              <label
                className={cn(
                  'flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card px-6 py-10 text-center transition-colors',
                  'hover:border-primary hover:bg-primary/[0.03]',
                  kind === 'pci' && !pciId && 'pointer-events-none opacity-50'
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files?.[0]
                  if (f) void readFile(f)
                }}
              >
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
                />
                <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
                  <FileSpreadsheet className="size-6" />
                </span>
                <span className="text-[15px] font-semibold">Arrastra el archivo o haz clic para elegirlo</span>
                <span className="text-muted-foreground text-[12.5px]">
                  Formatos .xlsx, .xls y .csv · se lee la primera hoja
                </span>
              </label>

              {history.data && history.data.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-muted-foreground mb-3 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
                      <History className="size-3" />
                      Importaciones recientes
                    </p>
                    <ul className="space-y-1.5">
                      {history.data.map((h: any) => (
                        <li key={h.id} className="flex items-center gap-3 text-[12px]">
                          {h.status === 'completado' ? (
                            <CircleCheck className="text-success size-3.5 shrink-0" />
                          ) : (
                            <CircleX className="text-destructive size-3.5 shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{h.file_name ?? h.kind}</span>
                          <span className="text-muted-foreground shrink-0 tabular-nums">
                            {fmtNumber(h.ok_rows)} / {fmtNumber(h.total_rows)}
                          </span>
                          {h.error_rows > 0 && (
                            <Badge variant="destructive" className="shrink-0">{h.error_rows} err</Badge>
                          )}
                          <span className="text-muted-foreground shrink-0 text-[10.5px]">
                            {fmtRelative(h.created_at)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {/* ── 3. Mapeo ──────────────────────────────────────────────── */}
          {step === 'mapeo' && schema && (
            <motion.div key="mapeo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="bg-info/8 border-info/25 flex items-start gap-3 rounded-xl border px-4 py-3">
                <Sparkles className="text-info mt-0.5 size-4 shrink-0" />
                <p className="text-[12.5px] leading-snug">
                  Se detectaron <strong>{headers.length} columnas</strong> y{' '}
                  <strong>{fmtNumber(rows.length)} filas</strong> en <em>{file?.name}</em>. El sistema
                  mapeó automáticamente lo que reconoció; corrige lo que haga falta.
                </p>
              </div>

              <Card>
                <CardContent className="p-0">
                  <ul className="divide-y divide-border">
                    {schema.fields.map((f) => (
                      <li key={f.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-[13px] font-medium">
                            {f.label}
                            {f.required && <span className="text-destructive">*</span>}
                          </p>
                          {f.hint && <p className="text-muted-foreground text-[11px]">{f.hint}</p>}
                        </div>
                        <ArrowRight className="text-muted-foreground size-3.5 shrink-0" />
                        <Select
                          value={mapping[f.key] ?? '__none__'}
                          onValueChange={(v) =>
                            setMapping((m) => ({ ...m, [f.key]: v === '__none__' ? '' : v }))
                          }
                        >
                          <SelectTrigger className={cn('w-64', f.required && !mapping[f.key] && 'border-destructive')}>
                            <SelectValue placeholder="Sin asignar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sin asignar</SelectItem>
                            {headers.map((h) => (
                              <SelectItem key={h} value={h}>{h}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {mapping[f.key] && (
                          <span className="text-muted-foreground hidden w-40 truncate text-[11px] lg:block">
                            ej. {String(rows[0]?.[mapping[f.key]] ?? '—')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={reset}>
                  <ArrowLeft className="size-4" />
                  Otro archivo
                </Button>
                <Button onClick={validate} disabled={requiredMissing.length > 0} className="ml-auto">
                  Validar {fmtNumber(rows.length)} filas
                  <ArrowRight className="size-4" />
                </Button>
              </div>
              {requiredMissing.length > 0 && (
                <p className="text-destructive text-right text-[11.5px]">
                  Falta asignar: {requiredMissing.map((f) => f.label).join(', ')}
                </p>
              )}
            </motion.div>
          )}

          {/* ── 4. Validación ─────────────────────────────────────────── */}
          {step === 'validacion' && (
            <motion.div key="validacion" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Filas leídas', value: rows.length, tone: 'default' },
                  { label: 'Válidas para importar', value: valid.length, tone: 'success' },
                  { label: 'Con errores', value: rows.length - valid.length, tone: 'danger' },
                ].map((s) => (
                  <div key={s.label} className="bg-card rounded-xl border border-border p-4">
                    <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{s.label}</p>
                    <p className={cn(
                      'mt-1 text-2xl font-bold tabular-nums',
                      s.tone === 'success' && 'text-success',
                      s.tone === 'danger' && s.value > 0 && 'text-destructive'
                    )}>
                      {fmtNumber(s.value)}
                    </p>
                  </div>
                ))}
              </div>

              {issues.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <div className="border-b border-border px-4 py-3">
                      <p className="flex items-center gap-2 text-[13px] font-semibold">
                        <TriangleAlert className="text-destructive size-4" />
                        {issues.length} problemas encontrados
                      </p>
                      <p className="text-muted-foreground text-[11.5px]">
                        Estas filas se omitirán. Corrígelas en el Excel y vuelve a subirlo si las necesitas.
                      </p>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      <ul className="divide-y divide-border">
                        {issues.slice(0, 200).map((i, idx) => (
                          <li key={idx} className="flex items-center gap-3 px-4 py-2 text-[12px]">
                            <span className="text-muted-foreground w-16 shrink-0 font-mono text-[11px]">
                              fila {i.row}
                            </span>
                            <span className="w-32 shrink-0 truncate font-medium">{i.field}</span>
                            <span className="text-destructive min-w-0 flex-1 truncate">{i.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Previsualización */}
              {valid.length > 0 && (
                <Card>
                  <CardContent className="p-0">
                    <p className="border-b border-border px-4 py-3 text-[13px] font-semibold">
                      Previsualización de las primeras filas válidas
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11.5px]">
                        <thead className="bg-muted/40">
                          <tr>
                            {schema!.fields.map((f) => (
                              <th key={f.key} className="text-muted-foreground px-3 py-2 text-left font-semibold whitespace-nowrap">
                                {f.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {valid.slice(0, 8).map((r, i) => (
                            <tr key={i}>
                              {schema!.fields.map((f) => (
                                <td key={f.key} className="px-3 py-1.5 whitespace-nowrap">
                                  {r[f.key] == null ? <span className="text-muted-foreground">—</span> : String(r[f.key]).slice(0, 40)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setStep('mapeo')}>
                  <ArrowLeft className="size-4" />
                  Ajustar mapeo
                </Button>
                <Button onClick={runImport} loading={importing} disabled={!valid.length} className="ml-auto">
                  <Database className="size-4" />
                  Importar {fmtNumber(valid.length)} registros
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── 5. Resultado ──────────────────────────────────────────── */}
          {step === 'resultado' && result && (
            <motion.div key="resultado" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
              <Card>
                <CardContent className="flex flex-col items-center py-12 text-center">
                  <span className={cn(
                    'flex size-16 items-center justify-center rounded-2xl',
                    result.failed ? 'bg-destructive/12 text-destructive' : 'bg-success/12 text-success'
                  )}>
                    {result.failed ? <CircleX className="size-7" /> : <CircleCheck className="size-7" />}
                  </span>
                  <h3 className="mt-4 text-lg font-bold">
                    {result.failed ? 'Importación con errores' : 'Importación completada'}
                  </h3>
                  <p className="text-muted-foreground mt-1.5 max-w-md text-[13px]">
                    {result.inserted === 1 ? 'Se importó ' : 'Se importaron '}
                    <strong className="text-foreground">{fmtNumber(result.inserted)}</strong>
                    {result.inserted === 1 ? ' registro nuevo.' : ' registros nuevos.'}
                    {result.updated > 0 && (
                      <>
                        {' '}<strong className="text-foreground">{fmtNumber(result.updated)}</strong>
                        {result.updated === 1 ? ' ítem ya existía' : ' ítems ya existían'}: se actualizó su
                        descripción y se conservaron su estado, plazo y evidencias. La cuadrilla del Excel
                        solo se asignó a los que no tenían una.
                      </>
                    )}
                    {result.issues > 0 && ` ${fmtNumber(result.issues)} filas se omitieron por errores de validación.`}
                  </p>
                  {result.pcis?.length > 0 && (
                    <div className="mt-5 w-full max-w-md space-y-2 text-left">
                      <p className="text-muted-foreground text-[12px]">
                        Revisa los ítems, asígnalos a las cuadrillas y publica cada PCI: hasta entonces las
                        cuadrillas no lo ven.
                      </p>
                      {result.pcis.map((p: any) => (
                        <Link
                          key={p.id}
                          href={`/pci/${p.id}`}
                          className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[13px] hover:border-primary/40"
                        >
                          <span className="font-mono font-semibold">{p.code}</span>
                          <span className="flex items-center gap-2">
                            {p.nuevo && <Badge variant="secondary">Nuevo</Badge>}
                            <Badge variant={p.publicado ? 'success' : 'warning'}>
                              {p.publicado ? 'Publicado' : 'Borrador: revisar y publicar'}
                            </Badge>
                            <ArrowRight className="size-3.5" />
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="mt-6 flex gap-2">
                    <Button variant="outline" onClick={reset}>
                      <Upload className="size-4" />
                      Importar otro archivo
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </PageBody>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function Steps({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'tipo', label: 'Tipo' },
    { key: 'archivo', label: 'Archivo' },
    { key: 'mapeo', label: 'Mapeo de columnas' },
    { key: 'validacion', label: 'Validación' },
    { key: 'resultado', label: 'Resultado' },
  ]
  const idx = steps.findIndex((s) => s.key === step)

  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors',
              i < idx && 'text-success',
              i === idx && 'bg-primary text-primary-foreground',
              i > idx && 'text-muted-foreground'
            )}
          >
            <span className={cn(
              'flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold',
              i < idx && 'bg-success/15',
              i === idx && 'bg-white/20',
              i > idx && 'bg-muted'
            )}>
              {i < idx ? <CircleCheck className="size-3" /> : i + 1}
            </span>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="bg-border h-px w-4" />}
        </li>
      ))}
    </ol>
  )
}

// Columnas del ítem PCI que el Excel «describe» y que una reimportación puede
// refrescar: `campo` es la columna de pci_items y `origen` el campo del
// esquema de importación del que sale (lo que el usuario mapea).
const PCI_DESCRIPTIVOS = [
  { campo: 'description', origen: 'description' },
  { campo: 'section_id', origen: 'section_code' },
  { campo: 'prog_start_m', origen: 'prog_start_m' },
  { campo: 'prog_end_m', origen: 'prog_end_m' },
  { campo: 'side', origen: 'side' },
  { campo: 'activity_id', origen: 'activity_code' },
  { campo: 'quantity', origen: 'quantity' },
  { campo: 'notes', origen: 'notes' },
] as const

// N.º de los ítems que el PCI ya tiene (borrados incluidos: la llave única
// pci_id+item_number también los cuenta). Se pide por páginas porque un PCI
// puede pasar de las 1000 filas que devuelve la API de una vez.
async function numerosDeItemExistentes(
  sb: ReturnType<typeof createClient>,
  pciId: string
): Promise<Set<number>> {
  const numeros = new Set<number>()
  const pagina = 1000
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await sb
      .from('pci_items')
      .select('item_number')
      .eq('pci_id', pciId)
      .order('item_number')
      .range(desde, desde + pagina - 1)
    // Si no se puede saber qué existe, mejor no escribir nada que arriesgarse
    // a tratar como nuevo un ítem que ya se atendió.
    if (error) throw error
    for (const r of data ?? []) numeros.add(Number(r.item_number))
    if (!data || data.length < pagina) break
  }
  return numeros
}

function onConflictFor(kind: ImportKind['key']): string {
  switch (kind) {
    case 'inventario': return 'service_id,code'
    case 'actividades': return 'service_id,code'
    case 'pci': return 'pci_id,item_number'
    default: return 'client_id'
  }
}

function buildRow(
  kind: ImportKind['key'],
  v: any,
  serviceId: string,
  userId: string,
  pci?: any
): any {
  const base = { service_id: serviceId, created_by: userId }

  switch (kind) {
    case 'programacion':
      return {
        ...base,
        activity_id: v.activity_code,
        section_id: v.section_code,
        crew_id: v.crew_code ?? null,
        scheduled_on: v.scheduled_on,
        prog_start_m: v.prog_start_m,
        prog_end_m: v.prog_end_m ?? v.prog_start_m,
        target_qty: v.target_qty ?? 0,
        status: 'programado',
      }
    case 'pci': {
      // El vencimiento corre desde la recepción (o la notificación), igual
      // que cuando se fija el plazo en el detalle (pci_fijar_plazo).
      const desdeTexto = pci?.received_on ?? pci?.notified_on
      const desde = desdeTexto ? (parseFecha(desdeTexto) ?? new Date()) : new Date()
      const term = v.term_days ?? pci?.default_days ?? 7
      const due = new Date(desde.getTime() + term * 86400000)
      return {
        ...base,
        pci_id: pci?.id,
        item_number: v.item_number,
        description: v.description,
        section_id: v.section_code ?? null,
        prog_start_m: v.prog_start_m ?? null,
        prog_end_m: v.prog_end_m ?? v.prog_start_m ?? null,
        side: v.side ?? null,
        activity_id: v.activity_code ?? null,
        quantity: v.quantity ?? null,
        notes: v.notes ?? null,
        assigned_crew_id: v.crew_code ?? null,
        term_days: term,
        due_date: toISODate(due),
        status: 'pendiente',
      }
    }
    case 'inventario':
      return {
        ...base,
        code: v.code,
        name: v.name ?? null,
        type_id: v.type_code,
        section_id: v.section_code,
        progresiva_m: v.progresiva_m,
        side: v.side ?? 'derecho',
        condition: v.condition ?? 'no_evaluado',
        lat: v.lat ?? null,
        lng: v.lng ?? null,
      }
    case 'actividades':
      return {
        ...base,
        code: v.code,
        name: v.name,
        category: v.category ?? null,
        unit_id: v.unit_code,
        yield_per_day: v.yield_per_day ?? null,
      }
  }
}
