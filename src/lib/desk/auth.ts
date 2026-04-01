// Resolve o client_id do usuário autenticado para as APIs do Desk.
// Operadores: client_id vem de panel_users.
// Admins: client_id vem de ?client_id= na query string.

import { isAuthError, resolveRequestContext } from '@/lib/auth/request-context'
import { NextRequest } from 'next/server'

export interface DeskUser {
  userId: string
  clientId: string
  isAdmin: boolean
}

export async function resolveDeskUser(request: NextRequest): Promise<DeskUser | null> {
  try {
    const context = await resolveRequestContext({
      token: null,
      requestedClientId: request.nextUrl.searchParams.get('client_id'),
      requireClientId: false,
    })

    if (!context.userId) return null

    return {
      userId: context.userId,
      clientId: context.clientId ?? '',
      isAdmin: context.role === 'admin',
    }
  } catch (error) {
    if (isAuthError(error) && error.status === 401) {
      return null
    }
    if (isAuthError(error)) {
      console.error('[desk/auth] Erro de autorização:', error.message)
      return null
    }
    console.error('[desk/auth] Erro ao resolver usuário:', error)
    return null
  }
}
