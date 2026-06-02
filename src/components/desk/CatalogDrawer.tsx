'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Loader2, Search, ShoppingBag, Send, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import Image from 'next/image'

interface Product {
  id: string
  name: string
  category: string
  price_amount: number | null
  description_short: string | null
  description_long: string | null
  main_image_url: string | null
  stock_quantity: number
  sku: string | null
}

interface Props {
  clientId: string
  conversationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onProductSent?: () => void
}

export function CatalogDrawer({ clientId, conversationId, open, onOpenChange, onProductSent }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/store/products?client_id=${clientId}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(Array.isArray(data) ? data : [])
      } else {
        toast.error('Erro ao carregar produtos do catálogo')
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro de conexão ao carregar produtos')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    if (open) {
      void loadProducts()
    }
  }, [open, loadProducts])

  const handleSendProduct = async (product: Product) => {
    setSendingId(product.id)
    try {
      const res = await fetch(`/api/desk/conversations/${conversationId}/send-catalog-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id }),
      })

      if (res.ok) {
        toast.success(`Produto "${product.name}" enviado com sucesso!`)
        if (onProductSent) onProductSent()
        onOpenChange(false)
      } else {
        const errData = await res.json().catch(() => ({}))
        toast.error(errData.error || 'Erro ao enviar produto')
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro de rede ao enviar produto')
    } finally {
      setSendingId(null)
    }
  };

  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return true
    return (
      p.name.toLowerCase().includes(query) ||
      (p.category && p.category.toLowerCase().includes(query)) ||
      (p.description_short && p.description_short.toLowerCase().includes(query)) ||
      (p.sku && p.sku.toLowerCase().includes(query))
    )
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ShoppingBag size={18} className="text-primary" />
            Catálogo de Produtos
          </SheetTitle>
          <SheetDescription className="text-xs">
            Selecione um produto do catálogo para enviar diretamente no WhatsApp do cliente.
          </SheetDescription>
        </SheetHeader>

        {/* Search Input */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, SKU, categoria..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin text-primary" />
              Carregando catálogo...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
              <ShoppingBag size={36} className="text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">Nenhum produto encontrado</p>
              <p className="text-xs text-muted-foreground/60">
                {products.length === 0
                  ? 'Cadastre produtos nas configurações da loja.'
                  : 'Tente mudar o termo de busca.'}
              </p>
            </div>
          ) : (
            filteredProducts.map((product) => {
              const priceFormatted = product.price_amount
                ? `R$ ${Number(product.price_amount).toFixed(2)}`
                : 'Sob consulta'
              
              return (
                <div
                  key={product.id}
                  className="rounded-lg border border-border/60 bg-card p-3 flex gap-3 hover:border-primary/40 transition-colors"
                >
                  <div className="relative h-16 w-16 rounded-md bg-muted flex-shrink-0 overflow-hidden border border-border/40">
                    {product.main_image_url ? (
                      <Image
                        src={product.main_image_url}
                        alt={product.name}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <ShoppingBag size={20} />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-xs font-semibold text-foreground truncate" title={product.name}>
                          {product.name}
                        </h4>
                        <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                          {product.category}
                        </span>
                      </div>
                      {product.description_short && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {product.description_short}
                        </p>
                      )}
                      <p className="text-xs font-bold text-primary mt-1">{priceFormatted}</p>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
                      <span className="text-[10px] text-muted-foreground">
                        Estoque: <strong className={product.stock_quantity > 0 ? "text-green-600" : "text-destructive"}>{product.stock_quantity}</strong>
                      </span>
                      <Button
                        size="sm"
                        className="h-6 px-2.5 text-[10px] gap-1"
                        onClick={() => handleSendProduct(product)}
                        disabled={sendingId !== null}
                      >
                        {sendingId === product.id ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <Send size={10} />
                        )}
                        Enviar
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
