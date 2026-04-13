import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // Desk APIs resolvem auth e rate limit no próprio handler. Excluir esse
    // namespace evita buffering parcial de bodies grandes pelo proxy do Next.
    '/((?!api/desk|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
