import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

interface ClientMetricsProps {
  clientId: string
  instanceName?: string | null
}

export async function ClientMetrics({ instanceName }: ClientMetricsProps) {
  const supabase = await createClient()

  // Busca métricas das tabelas existentes usando o instance name
  // As conversas são vinculadas pelo chatwoot_conversation_id
  let totalConversations = 0
  let totalAppointments = 0

  if (instanceName) {
    // Conta conversas (via messages ou conversations table)
    const { count: convCount } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })

    totalConversations = convCount ?? 0

    const { count: apptCount } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true })

    totalAppointments = apptCount ?? 0
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Métricas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-2xl font-bold">{totalConversations}</p>
            <p className="text-xs text-muted-foreground">Conversas</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{totalAppointments}</p>
            <p className="text-xs text-muted-foreground">Agendamentos</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
