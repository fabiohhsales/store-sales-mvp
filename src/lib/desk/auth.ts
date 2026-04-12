// Resolve o client_id do usuário autenticado para as APIs do Desk.
// Operadores: client_id vem de panel_users.
// Admins: client_id vem de ?client_id= na query string.

import { isAuthError, resolveRequestContext } from '@/lib/auth/request-context'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, RATE_LIMITS } from './rate-limit'

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

/**
 * Verifica rate limit por IP. Retorna NextResponse 429 se excedido, null se OK.
 * Uso: `const blocked = applyRateLimit(request); if (blocked) return blocked;`
 */
export function applyRateLimit(
  request: NextRequest,
  limit: number = RATE_LIMITS.default
): NextResponse | null {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  const result = checkRateLimit(ip, limit)

  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Muitas requisições. Tente novamente em instantes.' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  return null
}
