'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { Copy, ExternalLink, Link2 } from 'lucide-react'

interface PublicLinkProps {
  instanceName: string
}

export function PublicLink({ instanceName }: PublicLinkProps) {
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/connect/${instanceName}`
    : `/connect/${instanceName}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" />
          Link Público
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Envie este link para o cliente conectar o WhatsApp e Google Calendar.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
            /connect/{instanceName}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(url)
              toast.success('Link copiado!')
            }}
          >
            <Copy className="mr-2 h-3 w-3" />
            Copiar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(`/connect/${instanceName}`, '_blank')}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
