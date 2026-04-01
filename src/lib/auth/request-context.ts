import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type RequestContextRole = 'admin' | 'operator' | 'embed'
export type RequestContextSource = 'session' | 'token'

export interface RequestContext {
  userId: string | null
  role: RequestContextRole
  source: RequestContextSource
  clientId: string | null
}

export class AuthError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError
}

async function resolveSessionContext(
  requestedClientId: string | null,
  requireClientId: boolean
): Promise<RequestContext> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new AuthError('Não autorizado', 401)
  }

  const admin = createAdminClient()
  const { data: panelUser } = await admin
    .from('panel_users')
    .select('role, client_id')
    .eq('id', user.id)
    .maybeSingle()

  let role: 'admin' | 'operator' = panelUser?.role === 'operator' ? 'operator' : 'admin'
  let boundClientId = panelUser?.client_id ?? null

  if (!panelUser) {
    const email = user.email ?? `${user.id}@unknown`
    const { error } = await admin
      .from('panel_users')
      .insert({ id: user.id, email, role: 'admin', client_id: null })
    if (error && error.code !== '23505') {
      throw new AuthError('Erro ao validar contexto do usuário', 500)
    }
    role = 'admin'
    boundClientId = null
  }

  if (role === 'operator') {
    if (!boundClientId) {
      throw new AuthError('Operador sem vínculo de cliente', 403)
    }
    if (requestedClientId && requestedClientId !== boundClientId) {
      throw new AuthError('Acesso negado para este client_id', 403)
    }
    return {
      userId: user.id,
      role,
      source: 'session',
      clientId: boundClientId,
    }
  }

  if (requireClientId && !requestedClientId) {
    throw new AuthError('client_id é obrigatório', 400)
  }

  return {
    userId: user.id,
    role,
    source: 'session',
    clientId: requestedClientId ?? null,
  }
}

export async function resolveRequestContext(options: {
  token: string | null
  requestedClientId: string | null
  requireClientId?: boolean
}): Promise<RequestContext> {
  const { token, requestedClientId, requireClientId = true } = options

  if (token) {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('panel_embed_tokens')
      .select('client_id, user_id')
      .eq('token', token)
      .single()

    if (error || !data) {
      throw new AuthError('Token inválido ou expirado', 401)
    }

    admin
      .from('panel_embed_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token)
      .then(() => {})

    return {
      userId: data.user_id ?? null,
      role: 'embed',
      source: 'token',
      clientId: data.client_id,
    }
  }

  return resolveSessionContext(requestedClientId, requireClientId)
}

export async function resolveSessionRoleContext(): Promise<RequestContext> {
  return resolveSessionContext(null, false)
}
