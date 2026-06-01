'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShoppingBag, Settings, LayoutGrid, Loader2, Play } from 'lucide-react'
import { toast } from 'sonner'

interface StoreModulePanelProps {
  clientId: string
  clientName: string
  hasWhatsAppConfig: boolean
  initialStore: { id: string; name: string } | null
}

export function StoreModulePanel({
  clientId,
  clientName,
  hasWhatsAppConfig,
  initialStore,
}: StoreModulePanelProps) {
  const [store, setStore] = useState<{ id: string; name: string } | null>(initialStore)
  const [loading, setLoading] = useState(false)

  async function handleInitialize() {
    if (!hasWhatsAppConfig) {
      toast.error('Você precisa configurar o WhatsApp do cliente antes de inicializar o Módulo de Loja!')
      return
    }

    try {
      setLoading(true)
      const res = await fetch('/api/store/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          name: `Loja - ${clientName}`,
        }),
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Falha ao inicializar loja')
      }

      const data = await res.json()
      setStore({ id: data.store_id, name: `Loja - ${clientName}` })
      toast.success('Módulo de Loja inicializado com sucesso!')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao inicializar loja.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border border-border/40 bg-card/60 backdrop-blur-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingBag className="h-4 w-4 text-primary" />
            Módulo de Loja (Store Sales)
          </CardTitle>
          {store ? (
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              Ativo
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              Não Inicializado
            </Badge>
          )}
        </div>
        <CardDescription>
          Gerencie catálogo de produtos RAG, regras comerciais e inteligência da loja deste cliente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {store ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm border rounded-lg p-3 bg-background/50">
              <span className="text-muted-foreground font-medium">Nome do Estabelecimento</span>
              <span className="font-semibold text-foreground">{store.name}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Link href={`/store/settings?client_id=${clientId}`} passHref>
                <Button className="w-full justify-center font-bold text-xs" variant="outline">
                  <Settings className="mr-1.5 h-3.5 w-3.5" />
                  Configurações
                </Button>
              </Link>
              <Link href={`/store/products?client_id=${clientId}`} passHref>
                <Button className="w-full justify-center font-bold text-xs" variant="outline">
                  <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
                  Catálogo RAG
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-center py-2">
            <p className="text-xs text-muted-foreground">
              Este cliente ainda não possui o módulo de loja ativado. A inicialização criará o catálogo e a persona da IA.
            </p>
            <Button
              onClick={handleInitialize}
              disabled={loading}
              className="w-full font-bold shadow-lg shadow-primary/20 gap-1.5 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Inicializando...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Ativar Módulo de Loja
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
