#!/usr/bin/env node
/** Genera el par de claves VAPID para Web Push. */
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()
console.log('\n─── Claves VAPID de SIGOV ───────────────────────────────────\n')
console.log('Añade estas líneas a .env.local y a las variables de Vercel:\n')
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log('\nLa privada NUNCA debe salir del servidor.\n')
