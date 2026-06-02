import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { getStoreSession } from '@/lib/auth/store-session'

export default async function DeskGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getStoreSession()
  if (!session) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar audience="client" clientRole={session.role} />
      <div className="flex flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
