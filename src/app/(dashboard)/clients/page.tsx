import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClientList } from '@/components/dashboard/client-list'
import { listClients } from '@/lib/db/clients'

export default async function ClientsPage() {
  const clients = await listClients()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
        <Link href="/clients/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Novo Cliente
          </Button>
        </Link>
      </div>
      <ClientList clients={clients} />
    </div>
  )
}
