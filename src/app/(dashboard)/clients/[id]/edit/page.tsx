import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getClientById } from '@/lib/db/clients'
import { EditClientForm } from '@/components/client-detail/edit-client-form'

export default async function EditClientPage({
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
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Editar: {client.name}</h1>
      </div>

      <EditClientForm client={client} />
    </div>
  )
}
