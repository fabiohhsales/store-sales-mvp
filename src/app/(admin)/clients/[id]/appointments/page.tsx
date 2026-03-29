import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getClientById } from '@/lib/db/clients'
import { AgendaTable } from '@/components/agenda/agenda-table'

export default async function ClientAppointmentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let client
  try {
    client = await getClientById(id)
  } catch {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/clients/${id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Agenda</h1>
        <p className="text-muted-foreground">{client.name}</p>
      </div>

      {!(client.chatwoot_account_id ?? client.panel_whatsapp_config?.chatwoot_account_id) ? (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm text-warning">
            Chatwoot ainda não provisionado para este cliente. A agenda ficará disponível em breve.
          </p>
        </div>
      ) : (
        <AgendaTable clientId={id} />
      )}
    </div>
  )
}
