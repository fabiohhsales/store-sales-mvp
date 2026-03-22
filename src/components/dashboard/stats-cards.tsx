import { Users, Wifi, WifiOff, Clock } from 'lucide-react'
import type { PanelClientWithRelations } from '@/types/database'

interface StatsCardsProps {
  clients: PanelClientWithRelations[]
}

export function StatsCards({ clients }: StatsCardsProps) {
  const total = clients.length
  const active = clients.filter((c) => c.status === 'active').length
  const disconnected = clients.filter((c) => c.status === 'disconnected').length
  const pending = clients.filter((c) =>
    ['draft', 'pending_whatsapp', 'pending_google', 'configuring'].includes(c.status)
  ).length

  const stats = [
    { label: 'Total de Clientes', value: total, icon: Users, color: 'hsl(var(--muted-foreground))', delay: 0 },
    { label: 'Ativos', value: active, icon: Wifi, color: 'hsl(var(--success))', delay: 80 },
    { label: 'Desconectados', value: disconnected, icon: WifiOff, color: 'hsl(var(--destructive))', delay: 160 },
    { label: 'Pendentes', value: pending, icon: Clock, color: 'hsl(var(--warning))', delay: 240 },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="stat-card opacity-0 animate-fade-in"
          style={{ animationDelay: `${stat.delay}ms` }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{stat.label}</span>
            <stat.icon size={20} style={{ color: stat.color }} />
          </div>
          <span className="text-3xl font-bold text-foreground tabular-nums">{stat.value}</span>
        </div>
      ))}
    </div>
  )
}
