'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null

export function createClient() {
  if (cached) return cached
  cached = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 4 } },
      global: { headers: { 'x-sigov-client': 'web' } },
    }
  )
  return cached
}

export const supabase = () => createClient()

/**
 * Trae TODAS las filas de una consulta, no las primeras 1 000.
 *
 * PostgREST corta en 1 000 filas sin avisar: el inventario de 3 600 elementos
 * se veía completo pero le faltaba dos tercios. Esta función pagina hasta
 * agotar el resultado, con un tope de seguridad para no colgar el navegador.
 *
 *   const rows = await fetchAll((from, to) =>
 *     sb.from('v_road_assets').select('*').eq('service_id', id).range(from, to))
 */
export async function fetchAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  { page = 1000, max = 50_000 }: { page?: number; max?: number } = {}
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < max; from += page) {
    const { data, error } = await build(from, from + page - 1)
    if (error) throw error
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < page) break
  }
  return rows
}
