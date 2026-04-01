import { resolveRequestContext } from '@/lib/auth/request-context'

interface EmbedAuthResult {
  client_id: string
  authenticated: boolean
  source: 'token' | 'session'
  role: 'admin' | 'operator' | 'embed'
}

/**
 * Auth dual: valida via embed token OU sessão Supabase.
 * APIs de pipeline/agenda usam isso para aceitar ambos os métodos.
 */
export async function authenticateRequest(
  token: string | null,
  clientId: string | null
): Promise<EmbedAuthResult> {
  const context = await resolveRequestContext({
    token,
    requestedClientId: clientId,
    requireClientId: true,
  })

  if (!context.clientId) {
    throw new Error('client_id é obrigatório')
  }

  return {
    client_id: context.clientId,
    authenticated: true,
    source: context.source,
    role: context.role,
  }
}
