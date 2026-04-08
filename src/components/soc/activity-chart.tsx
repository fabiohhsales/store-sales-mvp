'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface ActivityPoint {
  date: string
  count: number
}

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const max = Math.max(...data.map((d) => d.count), 1)

  if (data.every((d) => d.count === 0)) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Sem atividade nos últimos 7 dias.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--foreground)' }}
          formatter={(v) => [Number(v ?? 0), 'ações']}
          cursor={{ fill: 'var(--secondary)' }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.count === max ? 'var(--primary)' : 'var(--muted-foreground)'}
              fillOpacity={entry.count === max ? 1 : 0.4}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
