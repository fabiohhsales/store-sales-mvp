import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type PanelRole = 'admin' | 'operator'

export interface PanelSession {
  user: User
  role: PanelRole
  clientId: string | null
  clientRole: 'admin' | 'agent' | null
}

export async function getPanelSession(): Promise<PanelSession | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  const admin = createAdminClient()
  const { data: panelUser } = await admin
    .from('panel_users')
    .select('role, client_id, client_role')
    .eq('id', user.id)
    .maybeSingle()

  let role: PanelRole = panelUser?.role === 'operator' ? 'operator' : 'admin'
  let clientId = panelUser?.client_id ?? null
  let clientRole = (panelUser?.client_role as 'admin' | 'agent' | null) ?? null

  if (!panelUser) {
    const email = user.email ?? `${user.id}@unknown`
    const { error: insertError } = await admin
      .from('panel_users')
      .insert({ id: user.id, email, role: 'admin', client_id: null, client_role: 'admin' })

    if (insertError && insertError.code !== '23505') {
      throw insertError
    }

    role = 'admin'
    clientId = null
    clientRole = 'admin'
  }

  return {
    user,
    role,
    clientId,
    clientRole,
  }
}

export async function getPostLoginRedirectPath() {
  const session = await getPanelSession()
  return session?.role === 'operator' ? '/desk' : '/'
}
