'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

function OAuthCompleteContent() {
  const searchParams = useSearchParams()
  const status = searchParams.get('status') || 'success'

  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage(
        { type: 'google-oauth-result', status },
        window.location.origin
      )
      window.close()
    }
  }, [status])

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center">
        <p className="text-sm text-gray-600">
          {status === 'success'
            ? 'Google Calendar conectado! Fechando...'
            : 'Erro na conexão. Fechando...'}
        </p>
        <p className="mt-2 text-xs text-gray-400">
          Se esta janela não fechar automaticamente, pode fechá-la.
        </p>
      </div>
    </div>
  )
}

export default function OAuthCompletePage() {
  return (
    <Suspense>
      <OAuthCompleteContent />
    </Suspense>
  )
}
