import { redirect } from 'next/navigation'
import { Header } from '@/components/layout/header'
import { Sidebar } from '@/components/layout/sidebar'
import { getStoreSession } from '@/lib/auth/store-session'

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getStoreSession()

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar audience="client" clientRole={session.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header userEmail={session.user.email ?? ''} audience="client" clientRole={session.role} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
