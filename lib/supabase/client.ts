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
