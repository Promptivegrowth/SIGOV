'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  FolderOpen, Upload, Search, Download, Trash2, Eye, Pencil,
  FileText, FileSpreadsheet, FileImage, File, X, Paperclip, Calendar,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { PageHeader, PageBody } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input, Textarea, Field } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ImageViewer } from '@/components/shared/image-viewer'
import { SkeletonList } from '@/components/ui/skeleton'
import { EmptyState, DateRangeTabs, rangeFromPreset, type DatePresetKey } from '@/components/shared/misc'
import { ConfirmDialog } from '@/components/forms/form-dialog'
import { Tip } from '@/components/ui/primitives'
import { cn, fmtDate, fmtNumber, bytes, fmtRelative, toISODate, debounce } from '@/lib/utils'
import { toast } from 'sonner'

const KINDS = {
  contrato:     { label: 'Contrato',        color: 'var(--chart-1)' },
  pci:          { label: 'PCI · OSITRAN',   color: 'var(--sem-rojo)' },
  programacion: { label: 'Programación',    color: 'var(--chart-2)' },
  reporte:      { label: 'Reporte',         color: 'var(--chart-4)' },
  ssoma:        { label: 'SSOMA',           color: 'var(--success)' },
  plano:        { label: 'Plano',           color: 'var(--chart-3)' },
  acta:         { label: 'Acta',            color: 'var(--info)' },
  fotografico:  { label: 'Panel fotográfico', color: 'var(--warning)' },
  normativa:    { label: 'Normativa',       color: 'var(--muted-foreground)' },
  otro:         { label: 'Otro',            color: 'var(--muted-foreground)' },
} as const

type Kind = keyof typeof KINDS

function iconFor(mime?: string | null) {
  if (!mime) return File
  if (mime.includes('pdf')) return FileText
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return FileSpreadsheet
  if (mime.startsWith('image/')) return FileImage
  return File
}

export function ArchivoClient() {
  const { service, profile, can } = useSession()
  const qc = useQueryClient()
  const sb = React.useMemo(() => createClient(), [])

  const [q, setQ] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [kind, setKind] = React.useState<string>('todos')
  const [preset, setPreset] = React.useState<DatePresetKey>('90d')
  const [upload, setUpload] = React.useState(false)
  const [edit, setEdit] = React.useState<any>(null)
  const [preview, setPreview] = React.useState<any>(null)
  const [confirm, setConfirm] = React.useState<any>(null)

  const range = React.useMemo(() => rangeFromPreset(preset), [preset])

  // Búsqueda con rebote: no golpea la base en cada tecla
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const docs = useQuery({
    queryKey: ['documents', service.id, kind, debounced, range.from, range.to],
    queryFn: async () => {
      let query = sb
        .from('documents')
        .select('*, profiles:created_by(full_name), pcis(code)')
        .eq('service_id', service.id)
        .is('deleted_at', null)
        .gte('created_at', `${range.from}T00:00:00`)
        .lte('created_at', `${range.to}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(200)

      if (kind !== 'todos') query = query.eq('kind', kind as any)
      if (debounced) query = query.or(`title.ilike.%${debounced}%,file_name.ilike.%${debounced}%,description.ilike.%${debounced}%`)

      const { data } = await query
      return data ?? []
    },
  })

  const stats = React.useMemo(() => {
    const rows = docs.data ?? []
    const byKind: Record<string, number> = {}
    let size = 0
    for (const d of rows) {
      byKind[d.kind] = (byKind[d.kind] ?? 0) + 1
      size += Number(d.size_bytes ?? 0)
    }
    return { total: rows.length, size, byKind }
  }, [docs.data])

  const download = async (doc: any) => {
    const { data, error } = await sb.storage.from('documentos').createSignedUrl(doc.storage_path, 120, {
      download: doc.file_name,
    })
    if (error) return toast.error('No se pudo generar el enlace de descarga')
    window.open(data.signedUrl, '_blank')
  }

  const openPreview = async (doc: any) => {
    const { data } = await sb.storage.from('documentos').createSignedUrl(doc.storage_path, 600)
    setPreview({ ...doc, url: data?.signedUrl })
  }

  const remove = async (doc: any) => {
    const { error } = await sb.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', doc.id)
    if (error) { toast.error(error.message); return }
    await sb.storage.from('documentos').remove([doc.storage_path])
    toast.success('Documento eliminado')
    qc.invalidateQueries({ queryKey: ['documents'] })
  }

  return (
    <>
      <PageHeader
        icon={FolderOpen}
        title="Archivo documental"
        description="Todo el papeleo del contrato en un solo lugar y no en carpetas de Drive: contratos, PCIs de OSITRAN, actas, planos, normativa y reportes entregados. Buscable y descargable."
        actions={
          can.write && (
            <Button onClick={() => setUpload(true)}>
              <Upload className="size-4" />
              Subir documento
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 sm:max-w-sm">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              placeholder="Buscar por nombre, archivo o descripción…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                aria-label="Limpiar búsqueda"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tipos</SelectItem>
              {Object.entries(KINDS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: v.color }} />
                    {v.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeTabs value={preset} onChange={setPreset} />
          <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
            {fmtNumber(stats.total)} documentos · {bytes(stats.size)}
          </span>
        </div>
      </PageHeader>

      <PageBody className="space-y-4">
        {/* Atajos por tipo */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KINDS) as Kind[]).map((k) => {
            const n = stats.byKind[k] ?? 0
            return (
              <button
                key={k}
                onClick={() => setKind(kind === k ? 'todos' : k)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all',
                  kind === k ? 'border-primary bg-primary/8' : 'border-border bg-card hover:border-primary/30',
                  !n && 'opacity-50'
                )}
              >
                <span className="size-2 rounded-full" style={{ background: KINDS[k].color }} />
                {KINDS[k].label}
                <span className="font-bold tabular-nums">{n}</span>
              </button>
            )
          })}
        </div>

        {docs.isLoading ? (
          <SkeletonList rows={6} />
        ) : !docs.data?.length ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={FolderOpen}
                title={debounced ? 'Sin resultados' : 'El archivo está vacío'}
                description={debounced
                  ? `No hay documentos que coincidan con "${debounced}" en el periodo seleccionado.`
                  : 'Sube el contrato, los PCIs recibidos, las actas y los planos. Aquí quedan ordenados y accesibles para todo el equipo.'}
                action={can.write && !debounced && (
                  <Button onClick={() => setUpload(true)}>
                    <Upload className="size-4" />
                    Subir el primer documento
                  </Button>
                )}
              />
            </CardContent>
          </Card>
        ) : (
          <ul className="stagger space-y-2">
            {docs.data.map((d: any) => {
              const Icon = iconFor(d.mime_type)
              const k = KINDS[(d.kind as Kind) ?? 'otro']
              return (
                <motion.li key={d.id} layout>
                  <Card className="transition-shadow hover:shadow-sm">
                    <CardContent className="flex flex-wrap items-center gap-3.5 p-4">
                      <span
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: `color-mix(in oklch, ${k.color} 14%, transparent)`, color: k.color }}
                      >
                        <Icon className="size-5" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-[13.5px] font-semibold">{d.title}</h3>
                          <Badge variant="outline" style={{ color: k.color, borderColor: k.color }}>
                            {k.label}
                          </Badge>
                          {d.pcis?.code && <Badge variant="secondary">{d.pcis.code}</Badge>}
                        </div>
                        {d.description && (
                          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[12px]">{d.description}</p>
                        )}
                        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                          <span className="truncate font-mono">{d.file_name}</span>
                          <span>{bytes(d.size_bytes)}</span>
                          {d.doc_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="size-2.5" />
                              {fmtDate(d.doc_date)}
                            </span>
                          )}
                          <span>subido {fmtRelative(d.created_at)}</span>
                          {d.profiles?.full_name && <span>por {d.profiles.full_name}</span>}
                        </p>
                        {d.tags?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {d.tags.map((t: string) => (
                              <span key={t} className="bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-[10px]">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 gap-1">
                        <Tip label="Previsualizar">
                          <Button variant="ghost" size="icon-sm" onClick={() => openPreview(d)}>
                            <Eye className="size-4" />
                          </Button>
                        </Tip>
                        <Tip label="Descargar">
                          <Button variant="ghost" size="icon-sm" onClick={() => download(d)}>
                            <Download className="size-4" />
                          </Button>
                        </Tip>
                        {can.write && (
                          <Tip label="Editar datos">
                            <Button variant="ghost" size="icon-sm" onClick={() => setEdit(d)}>
                              <Pencil className="size-4" />
                            </Button>
                          </Tip>
                        )}
                        {can.manage && (
                          <Tip label="Eliminar">
                            <Button
                              variant="ghost" size="icon-sm"
                              onClick={() => setConfirm({
                                title: `¿Eliminar "${d.title}"?`,
                                description: 'El archivo se borra del almacenamiento y no se puede recuperar.',
                                action: () => remove(d),
                              })}
                            >
                              <Trash2 className="text-destructive size-4" />
                            </Button>
                          </Tip>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.li>
              )
            })}
          </ul>
        )}
      </PageBody>

      <UploadDialog
        open={upload}
        onOpenChange={setUpload}
        serviceId={service.id}
        userId={profile.id}
        onDone={() => qc.invalidateQueries({ queryKey: ['documents'] })}
      />

      <EditDialog
        doc={edit}
        onClose={() => setEdit(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ['documents'] })}
      />

      {/* Previsualización */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent size="xl" className="max-h-[92vh] p-0">
          {preview && (
            <>
              <DialogHeader className="border-b border-border p-5">
                <DialogTitle>{preview.title}</DialogTitle>
                <DialogDescription>
                  {preview.file_name} · {bytes(preview.size_bytes)}
                  {preview.doc_date ? ` · ${fmtDate(preview.doc_date)}` : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-[60vh] bg-muted/30">
                {preview.mime_type?.includes('pdf') ? (
                  <iframe src={preview.url} className="h-[70vh] w-full" title={preview.title} />
                ) : preview.mime_type?.startsWith('image/') ? (
                  <ImageViewer
                    src={preview.url}
                    alt={preview.title}
                    descargar={preview.file_name}
                    className="h-[70vh] w-full"
                  />
                ) : (
                  <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
                    <FileSpreadsheet className="text-muted-foreground size-10" />
                    <p className="text-muted-foreground text-[13px]">
                      Este tipo de archivo no se previsualiza en el navegador.
                    </p>
                    <Button onClick={() => download(preview)}>
                      <Download className="size-4" />
                      Descargar para abrirlo
                    </Button>
                  </div>
                )}
              </div>
              <DialogFooter className="border-t border-border p-4">
                <Button variant="outline" onClick={() => download(preview)}>
                  <Download className="size-4" />
                  Descargar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel="Sí, eliminar"
        onConfirm={async () => { await confirm?.action?.() }}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function UploadDialog({
  open, onOpenChange, serviceId, userId, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  serviceId: string
  userId: string
  onDone: () => void
}) {
  const sb = React.useMemo(() => createClient(), [])
  const [file, setFile] = React.useState<File | null>(null)
  const [title, setTitle] = React.useState('')
  const [kind, setKind] = React.useState<string>('otro')
  const [description, setDescription] = React.useState('')
  const [docDate, setDocDate] = React.useState(toISODate(new Date()))
  const [tags, setTags] = React.useState('')
  const [pciId, setPciId] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState(0)

  const pcis = useQuery({
    queryKey: ['pcis-select-doc', serviceId],
    enabled: open,
    queryFn: async () => (await sb.from('pcis').select('id, code, title').eq('service_id', serviceId).is('deleted_at', null)).data ?? [],
  })

  React.useEffect(() => {
    if (!open) {
      setFile(null); setTitle(''); setKind('otro'); setDescription('')
      setTags(''); setPciId(''); setProgress(0)
    }
  }, [open])

  const pick = (f: File) => {
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  const submit = async () => {
    if (!file) return toast.error('Elige un archivo')
    if (!title.trim()) return toast.error('Ponle un nombre al documento')

    setBusy(true)
    setProgress(20)
    const now = new Date()
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${serviceId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}_${safe}`

    const { error: upErr } = await sb.storage
      .from('documentos')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })

    if (upErr) {
      setBusy(false)
      toast.error(
        upErr.message.includes('mime')
          ? 'Tipo de archivo no permitido. Se aceptan PDF, Excel, Word, CSV e imágenes.'
          : upErr.message
      )
      return
    }

    setProgress(75)
    const { error } = await sb.from('documents').insert({
      service_id: serviceId,
      kind: kind as any,
      title: title.trim(),
      description: description.trim() || null,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      doc_date: docDate || null,
      pci_id: pciId || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      created_by: userId,
    })

    setBusy(false)
    if (error) {
      await sb.storage.from('documentos').remove([path])
      toast.error(error.message)
      return
    }

    setProgress(100)
    toast.success('Documento archivado')
    onDone()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Subir documento al archivo</DialogTitle>
          <DialogDescription>
            Queda guardado en la nube, clasificado y disponible para todo el equipo del contrato.
          </DialogDescription>
        </DialogHeader>

        <label
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-6 py-8 text-center transition-colors',
            'hover:border-primary hover:bg-primary/[0.03]',
            file && 'border-success/40 bg-success/[0.04]'
          )}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) pick(f) }}
        >
          <input
            type="file"
            className="hidden"
            accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.png,.jpg,.jpeg"
            onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
          />
          <Paperclip className={cn('size-6', file ? 'text-success' : 'text-muted-foreground')} />
          {file ? (
            <>
              <span className="text-[13px] font-semibold">{file.name}</span>
              <span className="text-muted-foreground text-[11.5px]">{bytes(file.size)} · toca para cambiar</span>
            </>
          ) : (
            <>
              <span className="text-[13px] font-medium">Arrastra el archivo o haz clic para elegirlo</span>
              <span className="text-muted-foreground text-[11.5px]">PDF, Excel, Word, CSV o imagen · hasta 25 MB</span>
            </>
          )}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre del documento" required className="col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contrato de servicio RV4 2026" className="h-10" />
          </Field>
          <Field label="Tipo" required>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(KINDS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fecha del documento">
            <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className="h-10" />
          </Field>
          {kind === 'pci' && (
            <Field label="PCI relacionado" className="col-span-2" hint="Vincula el documento al PCI que respalda">
              <Select value={pciId} onValueChange={setPciId}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                <SelectContent>
                  {(pcis.data ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} · {p.title.slice(0, 45)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Descripción" className="col-span-2">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Qué contiene y para qué sirve…" />
          </Field>
          <Field label="Etiquetas" className="col-span-2" hint="Separadas por coma. Sirven para encontrarlo después">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ositran, drenaje, 2026" className="h-10" />
          </Field>
        </div>

        {busy && (
          <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} loading={busy} disabled={!file}>
            <Upload className="size-4" />
            Archivar documento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
function EditDialog({ doc, onClose, onDone }: { doc: any; onClose: () => void; onDone: () => void }) {
  const sb = React.useMemo(() => createClient(), [])
  const [title, setTitle] = React.useState('')
  const [kind, setKind] = React.useState('otro')
  const [description, setDescription] = React.useState('')
  const [docDate, setDocDate] = React.useState('')
  const [tags, setTags] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!doc) return
    setTitle(doc.title ?? '')
    setKind(doc.kind ?? 'otro')
    setDescription(doc.description ?? '')
    setDocDate(doc.doc_date ?? '')
    setTags((doc.tags ?? []).join(', '))
  }, [doc])

  const save = async () => {
    setBusy(true)
    const { error } = await sb
      .from('documents')
      .update({
        title: title.trim(),
        kind: kind as any,
        description: description.trim() || null,
        doc_date: docDate || null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      .eq('id', doc.id)
    setBusy(false)
    if (error) { toast.error(error.message); return }
    toast.success('Documento actualizado')
    onDone()
    onClose()
  }

  return (
    <Dialog open={!!doc} onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Editar documento</DialogTitle>
          <DialogDescription>
            Cambia la ficha del documento. El archivo en sí no se reemplaza: para eso sube uno nuevo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" required className="col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" />
          </Field>
          <Field label="Tipo">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(KINDS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fecha del documento">
            <Input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className="h-10" />
          </Field>
          <Field label="Descripción" className="col-span-2">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </Field>
          <Field label="Etiquetas" className="col-span-2">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} className="h-10" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={busy}>Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
