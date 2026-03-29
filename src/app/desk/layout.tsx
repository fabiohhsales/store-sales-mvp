import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {children}
    </div>
  )
}
