'use client'

import { useState, useTransition } from 'react'
import { login } from '@/lib/actions/auth'

export function LoginForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await login(formData)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="glass-card w-full max-w-sm p-8 opacity-0 animate-fade-in">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-primary">Sales Tec</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Entre com suas credenciais para acessar o painel
        </p>
      </div>

      <form action={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="admin@salestec.com"
            required
            disabled={isPending}
            className="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            disabled={isPending}
            className="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
        </div>
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-50"
        >
          {isPending ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
