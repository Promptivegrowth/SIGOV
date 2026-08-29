'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/primitives'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // El campo trabaja con datos que cambian por hora, no por segundo
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error: any) => {
          if (error?.status === 401 || error?.status === 403) return false
          return failureCount < 2
        },
        networkMode: 'offlineFirst',
      },
      mutations: { networkMode: 'offlineFirst', retry: 1 },
    },
  })
}

let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') return makeQueryClient()
  return (browserQueryClient ??= makeQueryClient())
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  React.useEffect(() => {
    // Avisa al preloader que la app ya está viva
    window.dispatchEvent(new Event('sigov:ready'))
  }, [])

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={250} skipDelayDuration={400}>
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            expand={false}
            toastOptions={{
              classNames: {
                toast: 'rounded-xl border border-border shadow-lg',
                title: 'font-medium text-sm',
                description: 'text-xs',
              },
            }}
          />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
