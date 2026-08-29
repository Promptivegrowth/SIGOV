import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'SIGOV · Sistema Integral de Gestión Operativa Vial',
    short_name: 'SIGOV',
    description:
      'Programación, ejecución en campo, evidencia georreferenciada, PCIs OSITRAN, SSOMA e inventario vial. Funciona sin conexión.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#101C5E',
    theme_color: '#1B31A0',
    lang: 'es-PE',
    dir: 'ltr',
    categories: ['business', 'productivity', 'utilities'],
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png' },
      { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
      { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png' },
      { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png' },
      { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-256.png', sizes: '256x256', type: 'image/png' },
      { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Registrar en campo',
        short_name: 'Campo',
        description: 'Abrir el parte diario de la cuadrilla',
        url: '/campo',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'PCIs por vencer',
        short_name: 'PCIs',
        description: 'Ítems de PCI con plazo próximo',
        url: '/pci',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Mapa operativo',
        short_name: 'Mapa',
        description: 'Mapa interactivo por progresivas',
        url: '/mapa',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  }
}
