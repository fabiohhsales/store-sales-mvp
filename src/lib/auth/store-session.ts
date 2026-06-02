import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type StoreRole = 'system_admin' | 'client_admin' | 'client_manager' | 'seller' | 'viewer'

export interface StoreSession {
  user: User
  role: StoreRole
  accountId: string | null
  activeStoreId: string | null
}

export async function getStoreSession(): Promise<StoreSession | null> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  const admin = createAdminClient()

  // 1. Fetch memberships for this user
  const { data: memberships } = await admin
    .from('store_account_memberships')
    .select('role, account_id')
    .eq('user_id', user.id)
    .eq('is_active', true)

  if (!memberships || memberships.length === 0) {
    // If no membership exists, check if they have a legacy user profile
    const { data: panelUser } = await admin
      .from('panel_users')
      .select('role, client_id, client_role')
      .eq('id', user.id)
      .maybeSingle()

    if (panelUser) {
      const role = panelUser.role === 'admin'
        ? 'system_admin'
        : (panelUser.client_role === 'admin' ? 'client_admin' : 'seller')

      const { error: insertError } = await admin
        .from('store_account_memberships')
        .insert({
          account_id: panelUser.client_id,
          user_id: user.id,
          role,
          is_active: true
        })

      if (insertError && insertError.code !== '23505') {
        console.error('[store-session] Failed to backfill store_account_membership:', insertError)
      }

      return {
        user,
        role: role as StoreRole,
        accountId: panelUser.client_id,
        activeStoreId: null
      }
    }

    return null
  }

  // System admin takes precedence
  const systemAdminMem = memberships.find((m) => m.role === 'system_admin')
  if (systemAdminMem) {
    return {
      user,
      role: 'system_admin',
      accountId: null,
      activeStoreId: null,
    }
  }

  // Get first account membership for client users
  const primaryMem = memberships[0]
  const accountId = primaryMem.account_id
  const role = primaryMem.role as StoreRole

  // Fetch first active store for this account
  const { data: stores } = await admin
    .from('store_stores')
    .select('id')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .limit(1)

  const activeStoreId = stores?.[0]?.id ?? null

  return {
    user,
    role,
    accountId,
    activeStoreId,
  }
}

export async function getStoreRedirectPath(): Promise<string> {
  const session = await getStoreSession()
  if (!session) return '/login'
  
  if (session.role === 'system_admin') {
    return '/'
  }
  
  return '/desk'
}
