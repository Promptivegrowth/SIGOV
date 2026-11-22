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
