import { Separator } from '@/components/ui/separator'
import { EmbedTokensSection } from '@/components/settings/embed-tokens-section'

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
              <p className="text-sm font-medium text-foreground">AI Engine</p>
              <p className="text-xs text-muted-foreground">
                {process.env.OPENAI_API_KEY ? 'OpenAI' : process.env.GROQ_API_KEY ? 'Groq' : 'Não configurado'}
                {' · '}
                {process.env.OPENAI_MODEL ?? 'gpt-4o'}
              </p>
            </div>
            <span className={`text-xs font-medium ${(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY) ? 'text-success' : 'text-warning'}`}>
              {(process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY) ? 'Configurado' : 'API Key pendente'}
            </span>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Google Calendar (Conta Central)</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Token OAuth da Sales Tec usado no modo &quot;google_shared&quot;. Cada cliente pode ter seu próprio modo de calendário.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Refresh Token</p>
              <p className="text-xs text-muted-foreground">GOOGLE_REFRESH_TOKEN no .env</p>
            </div>
            <span className={`text-xs font-medium ${process.env.GOOGLE_REFRESH_TOKEN ? 'text-success' : 'text-warning'}`}>
              {process.env.GOOGLE_REFRESH_TOKEN ? 'Configurado' : 'Não configurado'}
            </span>
          </div>
          <Separator className="bg-border" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Calendar ID Padrão</p>
              <p className="text-xs text-muted-foreground">Usado como fallback quando o cliente não especifica</p>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              {process.env.GOOGLE_CALENDAR_ID ?? 'primary'}
            </span>
          </div>
          <Separator className="bg-border" />
          <p className="text-xs text-muted-foreground">
            Para configurar o calendário de cada cliente, acesse a página do cliente e edite a seção &quot;Google Calendar&quot;.
            Convites por email utilizam a API do Google Calendar (sendUpdates), não SMTP.
          </p>
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

      <EmbedTokensSection />
    </div>
  )
}
