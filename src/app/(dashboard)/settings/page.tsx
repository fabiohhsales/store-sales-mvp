import { Separator } from '@/components/ui/separator'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>

      <div className="glass-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Google OAuth Credentials</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Configure as credenciais do Google Cloud Console para o fluxo OAuth.
            Estas variáveis são configuradas no servidor (.env).
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Client ID</label>
            <input
              disabled
              value={process.env.GOOGLE_CLIENT_ID ? '••••••••' : 'Não configurado'}
              className="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm text-muted-foreground disabled:opacity-60"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Client Secret</label>
            <input
              disabled
              value={process.env.GOOGLE_CLIENT_SECRET ? '••••••••' : 'Não configurado'}
              className="w-full px-3 py-2 rounded-md bg-secondary border border-border text-sm text-muted-foreground disabled:opacity-60"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Para alterar, edite as variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env do servidor.
          </p>
        </div>
      </div>

      <div className="glass-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Integrações</h2>
          <p className="text-xs text-muted-foreground mt-1">Status das integrações configuradas.</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Evolution API</p>
              <p className="text-xs text-muted-foreground">{process.env.EVOLUTION_API_URL}</p>
            </div>
            <span className="text-xs text-success font-medium">Configurado</span>
          </div>
          <Separator className="bg-border" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Chatwoot</p>
              <p className="text-xs text-muted-foreground">{process.env.CHATWOOT_URL}</p>
            </div>
            <span className="text-xs text-success font-medium">Configurado</span>
          </div>
          <Separator className="bg-border" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Supabase</p>
              <p className="text-xs text-muted-foreground">{process.env.NEXT_PUBLIC_SUPABASE_URL}</p>
            </div>
            <span className="text-xs text-success font-medium">Configurado</span>
          </div>
          <Separator className="bg-border" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">n8n</p>
              <p className="text-xs text-muted-foreground">{process.env.N8N_URL}</p>
            </div>
            <span className={`text-xs font-medium ${process.env.N8N_API_KEY ? 'text-success' : 'text-warning'}`}>
              {process.env.N8N_API_KEY ? 'Configurado' : 'API Key pendente'}
            </span>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Administradores</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Gerenciar admins é feito diretamente no Supabase Auth.
          </p>
        </div>
        <div className="p-5">
          <p className="text-sm text-muted-foreground">
            Para adicionar ou remover administradores, acesse o Supabase Studio → Authentication → Users.
          </p>
        </div>
      </div>
    </div>
  )
}
