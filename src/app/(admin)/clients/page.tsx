import Link from 'next/link'
import { Plus } from 'lucide-react'
import { ClientList } from '@/components/dashboard/client-list'
import { listClients } from '@/lib/db/clients'

export default async function ClientsPage() {
  const clients = await listClients()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Clientes</h1>
        <Link
          href="/clients/new"
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Link>
      </div>
      <ClientList clients={clients} />
    </div>
  )
}
