import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

interface EmbedAuthResult {
  client_id: string
  authenticated: boolean
  source: 'token' | 'session'
}

/**
 * Auth dual: valida via embed token OU sessão Supabase.
 * APIs de pipeline/agenda usam isso para aceitar ambos os métodos.
 */
export async function authenticateRequest(
  token: string | null,
  clientId: string | null
): Promise<EmbedAuthResult> {
  // Caminho 1: token de embed (para iframe do Chatwoot)
  if (token) {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('panel_embed_tokens')
      .select('client_id')
      .eq('token', token)
      .single()

    if (error || !data) {
      throw new Error('Token inválido ou expirado')
    }

    // Atualiza last_used_at (fire-and-forget)
    admin
      .from('panel_embed_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token)
      .then(() => {})

    return { client_id: data.client_id, authenticated: true, source: 'token' }
  }

  // Caminho 2: sessão Supabase (para admin logado)
  if (clientId) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      throw new Error('Não autorizado')
    }

    return { client_id: clientId, authenticated: true, source: 'session' }
  }

  throw new Error('Token ou client_id é obrigatório')
}
