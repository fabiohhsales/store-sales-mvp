import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname === '/login'
  const isAuthCallback = request.nextUrl.pathname === '/api/auth/callback'
  const isGoogleCallback = request.nextUrl.pathname === '/api/auth/google/callback'
  const isHealthApi = request.nextUrl.pathname.startsWith('/api/health/')
  const isPublicConnect = request.nextUrl.pathname.startsWith('/connect/')
  const isPublicQRApi = request.nextUrl.pathname.includes('/public-qr')
  const isPublicGoogleOAuth = request.nextUrl.pathname === '/api/auth/google/public'

  // Allow public routes
  if (isAuthCallback || isGoogleCallback || isHealthApi || isPublicConnect || isPublicQRApi || isPublicGoogleOAuth) {
    return supabaseResponse
  }

  // Not authenticated → redirect to login
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Authenticated user on login → redirect to dashboard
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
