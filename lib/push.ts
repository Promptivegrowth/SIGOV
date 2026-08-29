'use client'

import { createClient } from '@/lib/supabase/client'

/**
 * Web Push (VAPID) — reemplaza a FCM de la app nativa.
 * Android/Chrome/Edge/Escritorio: funciona directo.
 * iOS/Safari: SOLO si el usuario instaló la PWA en la pantalla de inicio.
 */

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushPermission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied'
  return Notification.permission
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** En iOS el push exige la app instalada: hay que decirlo, no fallar en silencio */
export function pushBlockedReason(): string | null {
  if (!pushSupported()) {
    if (isIOS() && !isStandalone()) {
      return 'En iPhone/iPad debes instalar SIGOV en la pantalla de inicio para recibir notificaciones.'
    }
    return 'Este navegador no soporta notificaciones push.'
  }
  if (pushPermission() === 'denied') {
    return 'Bloqueaste las notificaciones. Habilítalas desde los ajustes del navegador.'
  }
  return null
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false

  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapid) {
    console.warn('SIGOV: falta NEXT_PUBLIC_VAPID_PUBLIC_KEY')
    return false
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      }))

    const json = sub.toJSON() as any
    const sb = createClient()
    const { data: auth } = await sb.auth.getUser()
    if (!auth.user) return false

    await sb.from('push_subscriptions').upsert(
      {
        profile_id: auth.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
        device_label: isStandalone() ? 'PWA instalada' : 'Navegador',
        is_active: true,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )
    return true
  } catch (e) {
    console.error('SIGOV push:', e)
    return false
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  const sb = createClient()
  await sb.from('push_subscriptions').update({ is_active: false }).eq('endpoint', endpoint)
}
