'use client'

import * as React from 'react'
import { Truck, FileText, Cross, FireExtinguisher, HardHat, Users, ClipboardCheck, Wrench, ShieldQuestion } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/**
 * Piezas comunes del módulo SSOMA (maquetas SSOMA_01–14): chips de estado con
 * el código de color de la guía (verde vigente/conforme/cerrado, ámbar
 * observado/pendiente/por verificar, rojo vencido/no apto/abierto, gris no
 * aplica), tipos de inspección y la carga de archivos al bucket documentos.
 */
const TONO: Record<string, { t: string; c: string }> = {
  vigente: { t: 'Vigente', c: 'verde' }, conforme: { t: 'Conforme', c: 'verde' }, cerrado: { t: 'Cerrado', c: 'verde' },
  apto: { t: 'APTO', c: 'verde' }, operativo: { t: 'OPERATIVO', c: 'verde' }, confirmada: { t: 'Confirmada', c: 'verde' },
  observado: { t: 'Observado', c: 'ambar' }, pendiente: { t: 'Pendiente', c: 'ambar' }, por_verificar: { t: 'Por verificar', c: 'ambar' },
  subsanacion_enviada: { t: 'Subsanación enviada', c: 'azul' }, programado: { t: 'Programado', c: 'azul' },
  vencido: { t: 'Vencido', c: 'rojo' }, no_apto: { t: 'NO APTO', c: 'rojo' }, abierto: { t: 'Abierto', c: 'rojo' },
  no_aplica: { t: 'No aplica', c: 'gris' }, sin_dato: { t: 'Sin fecha', c: 'gris' },
}
const COLOR: Record<string, string> = {
  verde: 'bg-success/12 text-success', ambar: 'bg-warning/15 text-warning', rojo: 'bg-destructive/12 text-destructive',
  gris: 'bg-secondary text-muted-foreground', azul: 'bg-info/12 text-info',
}

export function ChipSsoma({ estado, texto, mayus, className }: { estado?: string | null; texto?: string; mayus?: boolean; className?: string }) {
  const k = String(estado ?? 'no_aplica').toLowerCase().replace(/\s+/g, '_')
  const d = TONO[k] ?? { t: estado ?? '—', c: k.includes('observ') || k.includes('fuera') ? 'ambar' : 'gris' }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', COLOR[d.c], className)}>
      <span className="size-1.5 rounded-full bg-current" />{texto ?? (mayus ? d.t.toUpperCase() : d.t)}
    </span>
  )
}

export const TIPOS_INSPECCION: Record<string, { t: string; i: any }> = {
  vehiculo: { t: 'Vehículo', i: Truck }, ats: { t: 'ATS', i: FileText }, botiquin: { t: 'Botiquín', i: Cross },
  extintor: { t: 'Extintor', i: FireExtinguisher }, equipo: { t: 'Equipo', i: Wrench }, higiene: { t: 'Higiene', i: HardHat },
  charla: { t: 'Charla', i: Users }, checklist: { t: 'Checklist', i: ClipboardCheck }, otro: { t: 'Otro', i: ShieldQuestion },
}
export function TipoInspeccion({ tipo }: { tipo: string }) {
  const d = TIPOS_INSPECCION[tipo] ?? TIPOS_INSPECCION.otro
  return <span className="inline-flex items-center gap-1.5"><d.i className="text-muted-foreground size-3.5" />{d.t}</span>
}
export const TIPOS_DOCUMENTO: Record<string, string> = {
  soat: 'SOAT', revision_tecnica: 'Revisión técnica', poliza: 'Póliza', licencia: 'Licencia de conducir',
  extintor: 'Extintor', botiquin: 'Botiquín', equipo: 'Equipo', otro: 'Otro',
}

/** Sube un archivo a documentos/{servicio}/ssoma/{carpeta}/… y devuelve la ruta. */
export async function subirArchivoSsoma(serviceId: string, carpeta: string, archivo: File) {
  const sb = createClient()
  const limpio = archivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_')
  const ruta = `${serviceId}/ssoma/${carpeta}/${Date.now()}_${limpio}`
  const { error } = await sb.storage.from('documentos').upload(ruta, archivo, { contentType: archivo.type || undefined, upsert: false })
  if (error) throw error
  return ruta
}

/** Huella SHA-256 del archivo (detecta el mismo archivo adjuntado dos veces). */
export async function huellaArchivo(archivo: File) {
  const buf = await archivo.arrayBuffer()
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Adjunta una evidencia SSOMA sin duplicar: si el mismo archivo ya está en el
 * objeto no se vuelve a subir, y el registro lleva un client_id para que un
 * reintento tras un corte devuelva lo ya guardado (0161).
 */
export async function adjuntarEvidenciaSsoma(o: {
  serviceId: string; objetoTipo: 'inspeccion' | 'hallazgo' | 'documento'; objetoId: string; archivo: File; descripcion: string
  origen?: string; borrador?: boolean; tomadaAt?: string | null
}): Promise<{ id: string; codigo: string; duplicada?: boolean }> {
  const sb = createClient()
  const sha = await huellaArchivo(o.archivo)
  const { data: ya } = await sb.from('ssoma_evidencias' as any).select('id, codigo').eq('objeto_tipo', o.objetoTipo).eq('objeto_id', o.objetoId).eq('sha256', sha).maybeSingle()
  if (ya) return { ...(ya as any), duplicada: true }
  const ruta = await subirArchivoSsoma(o.serviceId, `${o.objetoTipo}/${o.objetoId}`, o.archivo)
  const cuerpo = {
    p_service: o.serviceId, p_objeto_tipo: o.objetoTipo, p_objeto_id: o.objetoId, p_path: ruta, p_nombre: o.archivo.name, p_mime: o.archivo.type || null,
    p_bytes: o.archivo.size, p_descripcion: o.descripcion, p_origen: o.origen ?? 'archivo', p_tomada_at: o.tomadaAt ?? null, p_borrador: !!o.borrador,
    p_sha256: sha, p_client_id: crypto.randomUUID(),
  }
  let r = await sb.rpc('ssoma_evidencia_registrar' as any, cuerpo as any)
  // Un corte de red: se reintenta una vez con el mismo client_id (no duplica)
  if (r.error && /fetch|network/i.test(r.error.message ?? '')) r = await sb.rpc('ssoma_evidencia_registrar' as any, cuerpo as any)
  if (r.error) throw r.error
  return r.data as any
}

/** Paginación simple de listas (20 por página). */
export function usePagina<T>(lista: T[], tam = 20) {
  const [pagina, setPagina] = React.useState(0)
  const paginas = Math.max(1, Math.ceil(lista.length / tam))
  React.useEffect(() => { if (pagina >= paginas) setPagina(0) }, [paginas, pagina])
  return { pagina, setPagina, paginas, visibles: lista.slice(pagina * tam, pagina * tam + tam), total: lista.length, tam }
}

export function Paginador({ p }: { p: { pagina: number; setPagina: (n: number) => void; paginas: number; total: number; tam: number } }) {
  if (p.paginas <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 px-3 py-2 text-[12px]">
      <span className="text-muted-foreground">{p.pagina * p.tam + 1}–{Math.min(p.total, (p.pagina + 1) * p.tam)} de {p.total}</span>
      <button className="rounded border border-border px-2 py-0.5 disabled:opacity-40" disabled={p.pagina === 0} onClick={() => p.setPagina(p.pagina - 1)}>‹ Anterior</button>
      <span>Página {p.pagina + 1} de {p.paginas}</span>
      <button className="rounded border border-border px-2 py-0.5 disabled:opacity-40" disabled={p.pagina >= p.paginas - 1} onClick={() => p.setPagina(p.pagina + 1)}>Siguiente ›</button>
    </div>
  )
}

export async function abrirArchivoSsoma(ruta: string, bucket = 'documentos') {
  const sb = createClient()
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(ruta, 600)
  if (error || !data?.signedUrl) throw error ?? new Error('No se pudo abrir el archivo')
  window.open(data.signedUrl, '_blank', 'noopener')
}

export const pesoArchivo = (b?: number | null) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export function NotaSsoma({ children, tono = 'info' }: { children: React.ReactNode; tono?: 'info' | 'ambar' | 'rojo' }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px]',
      tono === 'info' ? 'bg-info/[0.08] text-info' : tono === 'ambar' ? 'bg-warning/12 text-warning' : 'bg-destructive/10 text-destructive font-semibold')}>
      <span className="mt-px">{tono === 'rojo' ? '⚠' : 'ⓘ'}</span><span>{children}</span>
    </p>
  )
}
