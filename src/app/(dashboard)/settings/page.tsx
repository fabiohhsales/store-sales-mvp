import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google OAuth Credentials</CardTitle>
          <CardDescription>
            Configure as credenciais do Google Cloud Console para o fluxo OAuth.
            Estas variáveis são configuradas no servidor (.env).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Client ID</Label>
            <Input
              disabled
              value={process.env.GOOGLE_CLIENT_ID ? '••••••••' : 'Não configurado'}
            />
          </div>
          <div className="space-y-2">
            <Label>Client Secret</Label>
            <Input
              disabled
              value={process.env.GOOGLE_CLIENT_SECRET ? '••••••••' : 'Não configurado'}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Para alterar, edite as variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env do servidor.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrações</CardTitle>
          <CardDescription>
            Status das integrações configuradas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Evolution API</p>
                <p className="text-xs text-muted-foreground">
                  {process.env.EVOLUTION_API_URL}
                </p>
              </div>
              <span className="text-xs text-green-600 font-medium">Configurado</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Chatwoot</p>
                <p className="text-xs text-muted-foreground">
                  {process.env.CHATWOOT_URL}
                </p>
              </div>
              <span className="text-xs text-green-600 font-medium">Configurado</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Supabase</p>
                <p className="text-xs text-muted-foreground">
                  {process.env.NEXT_PUBLIC_SUPABASE_URL}
                </p>
              </div>
              <span className="text-xs text-green-600 font-medium">Configurado</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">n8n</p>
                <p className="text-xs text-muted-foreground">
                  {process.env.N8N_URL}
                </p>
              </div>
              <span className={`text-xs font-medium ${process.env.N8N_API_KEY ? 'text-green-600' : 'text-yellow-600'}`}>
                {process.env.N8N_API_KEY ? 'Configurado' : 'API Key pendente'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Administradores</CardTitle>
          <CardDescription>
            Gerenciar admins é feito diretamente no Supabase Auth.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Para adicionar ou remover administradores, acesse o Supabase Studio → Authentication → Users.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
