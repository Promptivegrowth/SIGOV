'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'motion/react'
import {
  Eye, EyeOff, LogIn, ShieldCheck, WifiOff, MapPinned,
  Camera, Zap, ArrowRight, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { SigovMark } from '@/components/shared/logo'
import { DEMO_USERS, DEMO_PASSWORD, ROLES, APP } from '@/lib/constants'
import { cn, initials } from '@/lib/utils'
import { toast } from 'sonner'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

const FEATURES = [
  { icon: WifiOff, title: 'Offline-first', text: 'Las cuadrillas registran sin señal. Cero pérdidas al sincronizar.' },
  { icon: Camera, title: 'Evidencia sellada', text: 'Foto con GPS, fecha y marca de agua. Inmutable por diseño.' },
  { icon: Zap, title: 'PCI prioritario', text: 'Reordena la programación semanal automáticamente.' },
  { icon: MapPinned, title: 'Mapa por progresivas', text: 'Tramos, inventario y evidencias georreferenciadas.' },
]

export function LoginClient() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/dashboard'
  const supabase = createClient()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPass, setShowPass] = React.useState(false)
  const [loading, setLoading] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const signIn = React.useCallback(
    async (mail: string, pass: string, tag = 'form') => {
      setLoading(tag)
      setError(null)
      const { error } = await supabase.auth.signInWithPassword({ email: mail, password: pass })
      if (error) {
        setError(
          error.message === 'Invalid login credentials'
            ? 'Credenciales incorrectas. Verifica el correo y la contraseña.'
            : error.message
        )
        setLoading(null)
        return
      }
      toast.success('Bienvenido a SIGOV')
      router.push(next)
      router.refresh()
    },
    [supabase, router, next]
  )

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* ═══ Panel de marca ═══════════════════════════════════════════ */}
      <aside className="bg-brand-gradient relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="bg-mesh pointer-events-none absolute inset-0 opacity-70" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px)',
            backgroundSize: '52px 52px',
            maskImage: 'radial-gradient(ellipse 90% 70% at 50% 40%,#000 30%,transparent 78%)',
          }}
        />

        <div className="relative z-10 flex items-center gap-3">
          <SigovMark size={44} />
          <div>
            <div className="text-2xl font-bold tracking-tight text-white">SIGOV</div>
            <div className="text-[11px] font-medium tracking-[0.18em] text-white/50 uppercase">
              {APP.tagline}
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg">
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-[2.6rem] leading-[1.1] font-bold tracking-tight text-white"
          >
            Toda la operación vial,
            <br />
            <span className="text-accent">del campo al reporte.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 text-[15px] leading-relaxed text-white/65"
          >
            Programación semanal, ejecución en campo sin conexión, evidencia georreferenciada,
            PCIs de OSITRAN, SSOMA e inventario vial. Una sola plataforma, trazable de extremo a extremo.
          </motion.p>

          <div className="mt-10 grid grid-cols-2 gap-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-xl border border-white/10 bg-white/[0.05] p-4 backdrop-blur-sm"
              >
                <f.icon className="size-4 text-accent" />
                <div className="mt-2.5 text-[13px] font-semibold text-white">{f.title}</div>
                <div className="mt-1 text-[11.5px] leading-snug text-white/50">{f.text}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-[11px] text-white/35">
          <span>{APP.org} · RUC 20600222393</span>
          <span>Desarrollado por {APP.builtBy}</span>
        </div>
      </aside>

      {/* ═══ Panel de acceso ══════════════════════════════════════════ */}
      <main className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-[420px]">
          {/* Marca compacta en móvil */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <SigovMark size={40} />
            <div>
              <div className="text-xl font-bold tracking-tight">SIGOV</div>
              <div className="text-muted-foreground text-[10px] font-medium tracking-[0.16em] uppercase">
                {APP.tagline}
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight">Ingresar al sistema</h2>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Usa tu cuenta corporativa de {APP.org}.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void signIn(email, password)
            }}
            className="mt-7 space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                placeholder="usuario@etsvaleria.pe"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Contraseña</Label>
                <button type="button" className="text-muted-foreground hover:text-foreground text-xs transition-colors">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                  aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            <Button type="submit" className="h-11 w-full text-[15px]" loading={loading === 'form'}>
              <LogIn className="size-4" />
              Ingresar
            </Button>
          </form>

          {/* ═══ Acceso rápido de desarrollo ═══════════════════════════ */}
          {DEMO_MODE && (
            <div className="mt-9">
              <div className="flex items-center gap-3">
                <div className="bg-border h-px flex-1" />
                <span className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-wider uppercase">
                  <Zap className="size-3 text-accent" />
                  Acceso rápido · desarrollo
                </span>
                <div className="bg-border h-px flex-1" />
              </div>

              <p className="text-muted-foreground mt-3 text-center text-xs">
                Un clic para entrar con cada rol. Se desactiva con{' '}
                <code className="bg-muted rounded px-1 py-0.5 text-[10px]">NEXT_PUBLIC_DEMO_MODE=false</code>
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {DEMO_USERS.map((u, i) => {
                  const role = ROLES[u.role]
                  const isLoading = loading === u.email
                  return (
                    <motion.button
                      key={u.email}
                      type="button"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: 0.05 + i * 0.04 }}
                      onClick={() => void signIn(u.email, DEMO_PASSWORD, u.email)}
                      disabled={!!loading}
                      className={cn(
                        'group bg-card relative flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-all',
                        'hover:border-primary/40 hover:shadow-md active:scale-[0.98]',
                        'disabled:pointer-events-none disabled:opacity-60',
                        isLoading && 'border-primary ring-primary/20 ring-2'
                      )}
                    >
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                        style={{ background: role.color }}
                      >
                        {initials(u.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold leading-tight">{role.label}</div>
                        <div className="text-muted-foreground truncate text-[11px] leading-tight">{u.hint}</div>
                      </div>
                      <ArrowRight
                        className={cn(
                          'text-muted-foreground size-3.5 shrink-0 transition-transform',
                          'group-hover:text-primary group-hover:translate-x-0.5',
                          isLoading && 'animate-pulse'
                        )}
                      />
                    </motion.button>
                  )
                })}
              </div>

              <div className="text-muted-foreground mt-4 flex items-center justify-center gap-1.5 text-[11px]">
                <ShieldCheck className="size-3" />
                Contraseña común de demo:
                <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">{DEMO_PASSWORD}</code>
              </div>
            </div>
          )}

          <p className="text-muted-foreground mt-10 text-center text-[11px] lg:hidden">
            {APP.org} · Desarrollado por {APP.builtBy}
          </p>
        </div>
      </main>
    </div>
  )
}
