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
import { cn, fmtDate, fmtNumber, fmtRelative } from '@/lib/utils'
import { toast } from 'sonner'

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
        side: new Map(['derecho', 'izquierdo', 'ambos', 'eje'].map((c) => [normKey(c), c])),
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
        .select('id, code, title, notified_on, default_days')
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
    let failed = 0
    const errors: any[] = []

    try {
      const payload = valid.map((v) => buildRow(schema.key, v, service.id, profile.id, pciId, pcis.data))
      // Lotes de 200 para no exceder el límite del request
      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200)
        const { error, count } = await sb
          .from(schema.table as any)
          .upsert(chunk, { onConflict: onConflictFor(schema.key), count: 'exact' })
        if (error) {
          failed += chunk.length
          errors.push({ lote: i / 200 + 1, error: error.message })
        } else {
          inserted += count ?? chunk.length
        }
      }
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

      setResult({ inserted, failed, issues: issues.length })
      setImporting(false)
      setStep('resultado')
      qc.invalidateQueries()
      if (!failed) toast.success(`${inserted} registros importados`)
      else toast.error(`${failed} registros fallaron`)
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

  const requiredMissing = schema?.fields.filter((f) => f.required && !mapping[f.key]) ?? []

  return (
    <>
      <PageHeader
        icon={Upload}
        title="Importación desde Excel"
        description="Sube el archivo tal como lo maneja ETS VALERIA. El sistema detecta las columnas, valida fila a fila y muestra los errores antes de escribir nada en la base."
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
              <div className="grid gap-3 md:grid-cols-2">
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
              <div className="grid gap-3 sm:grid-cols-3">
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
                    Se importaron <strong className="text-foreground">{fmtNumber(result.inserted)}</strong> registros.
                    {result.issues > 0 && ` ${fmtNumber(result.issues)} filas se omitieron por errores de validación.`}
                  </p>
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
  pciId: string,
  pcis?: any[]
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
      const pci = pcis?.find((p) => p.id === pciId)
      const notified = pci?.notified_on ? new Date(pci.notified_on) : new Date()
      const term = v.term_days ?? pci?.default_days ?? 15
      const due = new Date(notified.getTime() + term * 86400000)
      return {
        ...base,
        pci_id: pciId,
        item_number: v.item_number,
        description: v.description,
        section_id: v.section_code ?? null,
        prog_start_m: v.prog_start_m ?? null,
        activity_id: v.activity_code ?? null,
        quantity: v.quantity ?? null,
        term_days: term,
        due_date: due.toISOString().slice(0, 10),
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
