import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPostLoginRedirectPath } from '@/lib/auth/panel-session'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const destination = next ?? await getPostLoginRedirectPath()
      return NextResponse.redirect(`${origin}${destination}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
