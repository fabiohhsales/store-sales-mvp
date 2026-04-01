import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const admin = createAdminClient()
  const { data: panelUser } = await admin
    .from('panel_users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const forcedMode = panelUser?.role === 'operator' ? 'client' : undefined

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar forcedMode={forcedMode} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header userEmail={user.email ?? ''} forcedMode={forcedMode} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
