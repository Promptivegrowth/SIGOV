'use client'

import * as React from 'react'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

/**
 * Los dos gráficos del tablero de PCI, aparte.
 *
 * Recharts pesa más que el resto de la pantalla junta; separarlo deja que
 * las cifras y las tablas se pinten mientras el gráfico llega.
 */

const CAJA = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  fontSize: 12,
}

export function PciPorPlazo({ data }: { data: any[] }) {
  const filas = data.map((p) => ({
    plazo: `${p.plazo} d`,
    Atendidos: Number(p.atendidos),
    Vencidos: Number(p.vencidos),
    Abiertos: Number(p.total) - Number(p.atendidos) - Number(p.vencidos),
  }))

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filas} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="plazo" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <Tooltip contentStyle={CAJA} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Atendidos" stackId="a" fill="var(--success)" />
          <Bar dataKey="Abiertos" stackId="a" fill="var(--warning)" />
          <Bar dataKey="Vencidos" stackId="a" fill="var(--destructive)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function PciTendencia({ data }: { data: any[] }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" minTickGap={28} />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <Tooltip contentStyle={CAJA} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="Agregados" stroke="var(--primary)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Levantados" stroke="var(--success)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
