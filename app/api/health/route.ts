import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const t0 = Date.now()
  try {
    const admin = createAdminClient()
    const { count, error } = await admin
      .from('services')
      .select('id', { count: 'exact', head: true })
    if (error) throw error
    return NextResponse.json({
      ok: true,
      db: 'up',
      services: count,
      latency_ms: Date.now() - t0,
      version: '1.0.0',
      at: new Date().toISOString(),
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, db: 'down', error: e?.message, latency_ms: Date.now() - t0 },
      { status: 503 }
    )
  }
}
