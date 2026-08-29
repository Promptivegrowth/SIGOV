/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist, NetworkFirst, CacheFirst, StaleWhileRevalidate, ExpirationPlugin } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // ── Tiles del mapa: pesados e inmutables → caché primero ────────────
    {
      matcher: ({ url }) =>
        url.hostname.includes('tile.openstreetmap.org') ||
        url.hostname.includes('arcgisonline.com') ||
        url.hostname.includes('fonts.openmaptiles.org'),
      handler: new CacheFirst({
        cacheName: 'sigov-map-tiles',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 900,
            maxAgeSeconds: 30 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // ── Evidencias en Storage: la foto no cambia nunca ──────────────────
    {
      matcher: ({ url }) => url.pathname.includes('/storage/v1/object'),
      handler: new CacheFirst({
        cacheName: 'sigov-evidencias',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 400,
            maxAgeSeconds: 14 * 24 * 60 * 60,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // ── Catálogos y RPC de lectura: red primero con respaldo en caché ───
    {
      matcher: ({ url, request }) =>
        url.pathname.startsWith('/rest/v1/') && request.method === 'GET',
      handler: new NetworkFirst({
        cacheName: 'sigov-api',
        networkTimeoutSeconds: 6,
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 24 * 60 * 60 })],
      }),
    },
    // ── Fuentes ────────────────────────────────────────────────────────
    {
      matcher: ({ request }) => request.destination === 'font',
      handler: new CacheFirst({
        cacheName: 'sigov-fonts',
        plugins: [new ExpirationPlugin({ maxEntries: 24, maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()

// ═══════════════════════════════════════════════════════════════════════════
// Background Sync: al recuperar señal, el navegador nos despierta y avisamos
// a las pestañas abiertas para que vacíen el outbox.
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sigov-sync') {
    event.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        clients.forEach((c) => c.postMessage({ type: 'SIGOV_SYNC' }))
      })()
    )
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Web Push
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return
  let payload: any = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'SIGOV', body: event.data.text() }
  }

  const severity = payload.severity ?? 'info'
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'SIGOV', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag: payload.tag ?? `sigov-${severity}`,
      renotify: severity === 'danger',
      requireInteraction: severity === 'danger',
      vibrate: severity === 'danger' ? [200, 80, 200, 80, 200] : [120],
      data: { url: payload.url ?? '/dashboard', ...payload.data },
      actions: payload.url ? [{ action: 'open', title: 'Abrir' }] : undefined,
    } as NotificationOptions)
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data as any)?.url ?? '/dashboard'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = all.find((c) => 'focus' in c)
      if (existing) {
        await (existing as WindowClient).focus()
        ;(existing as WindowClient).navigate(url)
        return
      }
      await self.clients.openWindow(url)
    })()
  )
})
