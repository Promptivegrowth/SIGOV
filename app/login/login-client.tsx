'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'motion/react'
import { Eye, EyeOff, LogIn, AlertCircle, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { ServiconLogo } from '@/components/shared/logo'
import { LogoEnMovimiento } from '@/components/shared/preloader'
import { DEMO_USERS, DEMO_PASSWORD, ROLES, APP } from '@/lib/constants'
import { cn, initials } from '@/lib/utils'
import { toast } from 'sonner'

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

/**
 * El acceso al sistema.
 *
 * Una sola cosa que hacer y un solo sitio donde mirar. La pantalla anterior
 * dedicaba media ventana a explicar el producto: quien entra aquí todos los
 * días a las seis de la mañana ya sabe qué hace el sistema, y a quien no lo
 * sabe no se lo va a enseñar un cartel en la puerta.
 *
 * El acceso rápido por rol se mantiene mientras `NEXT_PUBLIC_DEMO_MODE` esté
 * encendido —es lo que permite probar el sistema con los cinco perfiles sin
 * tipear— y viene plegado, para que no compita con el formulario real.
 */
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
  const [rolesAbiertos, setRolesAbiertos] = React.useState(false)

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
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-8">
      {/* ═══ El fondo ═════════════════════════════════════════════════ */}
      <div className="absolute inset-0 -z-10 bg-[oklch(0.245_0.080_256)]" />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.13]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.55) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.55) 1px,transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 45%,#000 25%,transparent 75%)',
        }}
      />
      {/* Un resplandor verde abajo, del lado de la marca */}
      <div
        className="pointer-events-none absolute -bottom-40 left-1/2 -z-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-[0.16] blur-3xl"
        style={{ background: 'oklch(0.62 0.19 142)' }}
      />

      {/* ═══ La marca ═════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="mb-7 flex flex-col items-center gap-3"
      >
        <LogoEnMovimiento size={62} />
        <div className="flex flex-col items-center gap-1">
          <span className="font-marca text-[27px] leading-none font-bold tracking-tight text-white">
            SIGO<span className="text-[oklch(0.72_0.19_140)]">V</span>
          </span>
          <span className="text-[10.5px] font-medium tracking-[0.2em] text-white/45 uppercase">
            {APP.tagline}
          </span>
        </div>
      </motion.div>

      {/* ═══ La tarjeta ═══════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        className="bg-card w-full max-w-[400px] rounded-2xl border border-white/10 p-7 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.55)] sm:p-8"
      >
        <h1 className="text-[19px] font-bold tracking-tight">Ingresar al sistema</h1>
        <p className="text-muted-foreground mt-1 text-[13px]">
          Con tu cuenta de {APP.org}.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void signIn(email, password)
          }}
          className="mt-6 space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              placeholder="usuario@gruposervicon.pe"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <button
                type="button"
                onClick={() =>
                  toast.info('Pide el restablecimiento al administrador del contrato', {
                    description: 'Por seguridad, las contraseñas solo las reasigna un Administrador.',
                  })
                }
                className="text-muted-foreground hover:text-foreground text-[11.5px] transition-colors"
              >
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
              className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-3 py-2.5 text-[13px]"
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

        {/* ═══ Acceso por rol, para probar ═══════════════════════════ */}
        {DEMO_MODE && (
          <div className="mt-6 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setRolesAbiertos((v) => !v)}
              className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between text-[12px] font-medium transition-colors"
            >
              Entrar con un rol de prueba
              <ChevronDown
                className={cn('size-3.5 transition-transform', rolesAbiertos && 'rotate-180')}
              />
            </button>

            {rolesAbiertos && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 space-y-1.5 overflow-hidden"
              >
                {DEMO_USERS.map((u) => {
                  const role = ROLES[u.role]
                  const cargando = loading === u.email
                  return (
                    <button
                      key={u.email}
                      type="button"
                      onClick={() => void signIn(u.email, DEMO_PASSWORD, u.email)}
                      disabled={!!loading}
                      className={cn(
                        'hover:bg-secondary/60 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors',
                        'disabled:pointer-events-none disabled:opacity-60',
                        cargando && 'bg-secondary'
                      )}
                    >
                      <span
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                        style={{ background: role.color }}
                      >
                        {initials(u.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium leading-tight">
                          {u.name}
                          <span className="text-muted-foreground ml-1.5 font-normal">
                            · {role.label}
                          </span>
                        </span>
                        <span className="text-muted-foreground block truncate text-[11px] leading-tight">
                          {u.email}
                          {u.hint ? ` · ${u.hint}` : ''}
                        </span>
                      </span>
                    </button>
                  )
                })}
                <p className="text-muted-foreground pt-1 text-[11px]">
                  Contraseña de todos:{' '}
                  <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10.5px]">
                    {DEMO_PASSWORD}
                  </code>
                </p>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>

      {/* ═══ El pie ═══════════════════════════════════════════════════ */}
      <div className="mt-7 flex flex-col items-center gap-3">
        <ServiconLogo width={132} claro />
        <p className="text-[10.5px] text-white/35">
          {APP.org} · Desarrollado por {APP.builtBy}
        </p>
      </div>
    </div>
  )
}
