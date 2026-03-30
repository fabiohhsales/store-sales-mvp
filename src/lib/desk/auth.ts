// Resolve o client_id do usuário autenticado para as APIs do Desk.
// Operadores: client_id vem de panel_users.
// Admins sem panel_users: usam ?client_id= da query string.

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

  // Verifica se existe entrada em panel_users
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

  // Fallback: usuário autenticado sem panel_users = admin legado (acesso total).
  // TODO: Remover este fallback após todos os admins terem registro em panel_users.
  //       Ver /api/clients/[id]/operators para criar registros via UI.
  const clientId = request.nextUrl.searchParams.get('client_id') ?? ''
  console.warn(`[desk/auth] Usuário ${user.id} sem panel_users — tratado como admin legado`)
  return { userId: user.id, clientId, isAdmin: true }
}
