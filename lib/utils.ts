import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 12450 → "12+450" · formato de progresiva vial */
export function fmtProgresiva(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return '—'
  const km = Math.floor(m / 1000)
  const rest = Math.round(m % 1000)
  return `${km}+${String(rest).padStart(3, '0')}`
}

/** "12+450" → 12450 */
export function parseProgresiva(p: string): number | null {
  if (!p) return null
  const clean = p.replace(/\s/g, '')
  if (/^\d+\+\d+$/.test(clean)) {
    const [km, m] = clean.split('+')
    return Number(km) * 1000 + Number(m)
  }
  const n = Number(clean)
  return Number.isFinite(n) ? n : null
}

export function fmtNumber(n: number | null | undefined, decimals = 0): string {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('es-PE', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `${n.toFixed(decimals)}%`
}

/**
 * Convierte a Date respetando la fecha tal como se guardó.
 *
 * Una fecha sin hora («2026-08-31») la interpreta JavaScript como medianoche
 * UTC, y en el Perú —cinco horas por detrás— eso se muestra como el día
 * anterior: el parte del 31 aparecía como del 30. Aquí ese caso se arma como
 * fecha local, que es lo que significa en la operación.
 */
export function parseFecha(d: string | Date | null | undefined): Date | null {
  if (!d) return null
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim())
  const date = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(d)
  return Number.isNaN(date.getTime()) ? null : date
}

export function fmtDate(d: string | Date | null | undefined, style: 'short' | 'long' | 'full' = 'short'): string {
  if (!d) return '—'
  const date = parseFecha(d)
  if (!date) return '—'
  const opts: Record<string, Intl.DateTimeFormatOptions> = {
    short: { day: '2-digit', month: '2-digit', year: 'numeric' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
    full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  }
  return new Intl.DateTimeFormat('es-PE', opts[style]).format(date)
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = parseFecha(d)
  if (!date) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export function fmtRelative(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = parseFecha(d)
  if (!date) return '—'
  const diff = date.getTime() - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('es-PE', { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000000], ['month', 2592000000], ['day', 86400000],
    ['hour', 3600000], ['minute', 60000], ['second', 1000],
  ]
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') return rtf.format(Math.round(diff / ms), unit)
  }
  return '—'
}

/** Genera un UUID v4 disponible en cualquier contexto (incluido el SW) */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function initials(name: string | null | undefined): string {
  if (!name) return '??'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function truncate(s: string | null | undefined, n = 80): string {
  if (!s) return ''
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** ISO week number */
export function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export function startOfWeek(d = new Date()): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = date.getDate() - day + (day === 0 ? -6 : 1)
  date.setDate(diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(d: Date | string, n: number): Date {
  const date = parseFecha(d) ?? new Date()
  const copia = new Date(date)
  copia.setDate(copia.getDate() + n)
  return copia
}

export function bytes(n: number | null | undefined): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function debounce<T extends (...args: any[]) => void>(fn: T, ms = 300) {
  let t: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** SHA-256 hex de un Blob — sella la integridad de la evidencia */
export async function sha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Distancia Haversine en metros */
export function distanceM(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function groupBy<T, K extends string | number>(arr: T[], key: (item: T) => K): Record<K, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    ;(acc[k] ||= []).push(item)
    return acc
  }, {} as Record<K, T[]>)
}
