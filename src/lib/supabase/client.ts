import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = typeof window !== 'undefined'
    ? (window as any).__ENV?.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = typeof window !== 'undefined'
    ? (window as any).__ENV?.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  return createBrowserClient(url!, key!)
}
