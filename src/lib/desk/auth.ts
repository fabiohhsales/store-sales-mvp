// Resolve o client_id do usuário autenticado para as APIs do Desk.
// Operadores: client_id vem de panel_users.
// Admins: client_id vem de ?client_id= na query string.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export interface DeskUser {
  userId: string
  clientId: string
  isAdmin: boolean
}

export async function resolveDeskUser(request: NextRequest): Promise<DeskUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  const { data: panelUser } = await admin
    .from('panel_users')
    .select('role, client_id')
    .eq('id', user.id)
    .maybeSingle()

  if (panelUser?.role === 'operator' && panelUser.client_id) {
    return { userId: user.id, clientId: panelUser.client_id, isAdmin: false }
  }

  if (panelUser?.role === 'admin') {
    const clientId = request.nextUrl.searchParams.get('client_id') ?? ''
    return { userId: user.id, clientId, isAdmin: true }
  }

  // Usuário autenticado sem panel_users: auto-provisiona como admin.
  // Garante que admins legados obtenham seu registro na primeira chamada,
  // eliminando o fallback nas chamadas seguintes.
  const email = user.email ?? `${user.id}@unknown`
  const { error } = await admin
    .from('panel_users')
    .insert({ id: user.id, email, role: 'admin', client_id: null })
  if (error && error.code !== '23505') {
    // 23505 = unique_violation (registro já existe — race condition, ok)
    console.error('[desk/auth] Erro ao auto-provisionar admin:', error.message)
  } else {
    console.info(`[desk/auth] Admin ${email} auto-provisionado em panel_users`)
  }

  const clientId = request.nextUrl.searchParams.get('client_id') ?? ''
  return { userId: user.id, clientId, isAdmin: true }
}
