import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
    {
      title: 'Total de Clientes',
      value: total,
      icon: Users,
      iconClass: 'text-muted-foreground',
    },
    {
      title: 'Ativos',
      value: active,
      icon: Wifi,
      iconClass: 'text-green-500',
    },
    {
      title: 'Desconectados',
      value: disconnected,
      icon: WifiOff,
      iconClass: 'text-destructive',
    },
    {
      title: 'Pendentes',
      value: pending,
      icon: Clock,
      iconClass: 'text-yellow-500',
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.iconClass}`} />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
