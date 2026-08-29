import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Providers } from '@/components/providers'
import { BootScreen } from '@/components/shared/boot-screen'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'SIGOV · Gestión Operativa Vial 4.0',
    template: '%s · SIGOV',
  },
  description:
    'Sistema Integral de Gestión Operativa Vial. Programación, ejecución en campo offline, evidencia georreferenciada, PCIs OSITRAN, SSOMA e inventario vial.',
  applicationName: 'SIGOV',
  authors: [{ name: 'Promptive', url: 'https://www.promptivedev.com' }],
  creator: 'Promptive · Luciérnaga & Asociados S.A.C.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SIGOV',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    locale: 'es_PE',
    title: 'SIGOV · Gestión Operativa Vial 4.0',
    description: 'Sistema Integral de Gestión Operativa Vial para ETS VALERIA',
    siteName: 'SIGOV',
  },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F8FC' },
    { media: '(prefers-color-scheme: dark)', color: '#101C5E' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PE" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        <link rel="dns-prefetch" href="https://tile.openstreetmap.org" />
        <BootScreen />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
