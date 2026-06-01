'use client'

import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Plus, ShoppingBag, Tag, Box, DollarSign, Eye, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface Product {
  id: string
  name: string
  category: string
  price_amount: number | null
  price_type: string
  stock_quantity: number
  delivery_region: string
  pickup_available: boolean
  delivery_available: boolean
  assembly_included: boolean
  status: string
  main_image_url: string | null
}

export default function StoreProductsPage() {
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Dialog state
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form states
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [priceType, setPriceType] = useState('fixed')
  const [priceAmount, setPriceAmount] = useState('')
  const [description, setDescription] = useState('')
  const [stock, setStock] = useState('10')
  const [pickup, setPickup] = useState(true)
  const [delivery, setDelivery] = useState(true)
  const [assembly, setAssembly] = useState(true)
  const [deliveryRegion, setDeliveryRegion] = useState('Leopoldina e região')
  const [imageUrl, setImageUrl] = useState('')

  useEffect(() => {
    loadStoreAndProducts()
  }, [])

  async function loadStoreAndProducts() {
    try {
      setLoading(true)
      setError(null)
      
      // 1. Fetch store ID
      const storeRes = await fetch('/api/store/settings')
      if (!storeRes.ok) throw new Error('Falha ao carregar dados da loja.')
      const storeData = await storeRes.json()
      
      if (!storeData.store) {
        setError('Você precisa configurar sua Loja na página de Configurações primeiro!')
        setProducts([])
        return
      }

      setStoreId(storeData.store.id)

      // 2. Fetch products
      const prodRes = await fetch(`/api/store/products?store_id=${storeData.store.id}`)
      if (!prodRes.ok) throw new Error('Falha ao carregar produtos.')
      const prodData = await prodRes.json()
      
      setProducts(prodData)
    } catch (err: any) {
      setError(err.message || 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!storeId) return

    try {
      setSubmitting(true)
      const res = await fetch('/api/store/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          name,
          category,
          price_type: priceType,
          price_amount: priceAmount ? Number(priceAmount) : null,
          description_long: description,
          stock_quantity: Number(stock),
          pickup_available: pickup,
          delivery_available: delivery,
          assembly_included: assembly,
          delivery_region: deliveryRegion,
          main_image_url: imageUrl || null,
        }),
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Erro ao criar produto')
      }

      toast.success('Produto cadastrado e indexado no RAG com sucesso!')
      
      // Reset form
      setName('')
      setCategory('')
      setPriceType('fixed')
      setPriceAmount('')
      setDescription('')
      setStock('10')
      setPickup(true)
      setDelivery(true)
      setAssembly(true)
      setDeliveryRegion('Leopoldina e região')
      setImageUrl('')

      setOpen(false)
      loadStoreAndProducts()
    } catch (err: any) {
      toast.error(err.message || 'Falha ao salvar produto')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Carregando catálogo de produtos...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <ShoppingBag className="h-8 w-8 text-primary" />
            Catálogo de Produtos
          </h1>
          <p className="text-muted-foreground">
            Gerencie seus móveis e eletrodomésticos. Produtos ativos são indexados no RAG da IA automaticamente.
          </p>
        </div>

        {storeId && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="font-bold shadow-lg shadow-primary/20">
                <Plus className="mr-2 h-4 w-4" /> Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl bg-card border-border/40 max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Produto</DialogTitle>
                <DialogDescription>
                  Preencha os detalhes do produto. Ele será disponibilizado no chat WhatsApp da Loja.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do Produto</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Roupeiro Joinville 6 portas" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Categoria</Label>
                    <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Móveis > Quarto > Roupeiro" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="price-type">Tipo de Preço</Label>
                    <Select value={priceType} onValueChange={setPriceType}>
                      <SelectTrigger id="price-type">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Preço Fixo</SelectItem>
                        <SelectItem value="on_request">Sob Consulta</SelectItem>
                        <SelectItem value="from_price">A partir de</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price-amount">Preço (R$)</Label>
                    <Input
                      id="price-amount"
                      type="number"
                      step="0.01"
                      disabled={priceType === 'on_request'}
                      value={priceAmount}
                      onChange={(e) => setPriceAmount(e.target.value)}
                      placeholder="Ex: 899.90"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="stock">Estoque</Label>
                    <Input id="stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Ex: 5" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição Longa (Especificações para o RAG)</Label>
                  <Textarea
                    id="description"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Materiais, quantidade de gavetas, cor, medidas de altura/largura etc. Muito importante para a IA responder correto!"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image-url">URL da Imagem Principal</Label>
                  <Input id="image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Ex: https://image.com/foto.jpg" />
                </div>

                <hr className="border-border/40" />

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="flex items-center justify-between border rounded-lg p-3 bg-background/50">
                    <div>
                      <Label className="text-xs font-semibold">Retirada na Loja</Label>
                      <p className="text-[10px] text-muted-foreground">Cliente retira</p>
                    </div>
                    <Switch checked={pickup} onCheckedChange={setPickup} />
                  </div>

                  <div className="flex items-center justify-between border rounded-lg p-3 bg-background/50">
                    <div>
                      <Label className="text-xs font-semibold">Entrega Disponível</Label>
                      <p className="text-[10px] text-muted-foreground">Loja entrega</p>
                    </div>
                    <Switch checked={delivery} onCheckedChange={setDelivery} />
                  </div>

                  <div className="flex items-center justify-between border rounded-lg p-3 bg-background/50">
                    <div>
                      <Label className="text-xs font-semibold">Montagem Inclusa</Label>
                      <p className="text-[10px] text-muted-foreground">Montagem grátis</p>
                    </div>
                    <Switch checked={assembly} onCheckedChange={setAssembly} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delivery-region">Regiões Atendidas de Entrega</Label>
                  <Input id="delivery-region" value={deliveryRegion} onChange={(e) => setDeliveryRegion(e.target.value)} />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cadastrando e Indexando RAG...
                      </>
                    ) : (
                      'Cadastrar Produto'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-border/60 rounded-xl p-12 text-center bg-card/10">
          <Box className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="font-semibold text-foreground">Nenhum produto cadastrado</p>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            Seu catálogo está vazio. Adicione produtos para treinar o agente de IA e realizar vendas no WhatsApp.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id} className="border border-border/40 bg-card/40 hover:bg-card/70 transition-all flex flex-col justify-between">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{product.category || 'Móveis'}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${
                    product.status === 'active' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted border-muted-foreground/20 text-muted-foreground'
                  }`}>
                    {product.status === 'active' ? 'Ativo (RAG)' : 'Rascunho'}
                  </span>
                </div>
                <CardTitle className="text-lg font-bold text-foreground mt-2 line-clamp-1">{product.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 py-2 space-y-3 flex-grow">
                <div className="flex items-baseline gap-1 text-2xl font-black text-primary">
                  {product.price_type === 'on_request' ? (
                    <span className="text-sm font-semibold text-muted-foreground">Preço sob consulta</span>
                  ) : (
                    <>
                      <span className="text-sm font-bold">R$</span>
                      <span>{product.price_amount?.toFixed(2)}</span>
                    </>
                  )}
                </div>

                <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                  {product.description_long || 'Sem descrição cadastrada.'}
                </p>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Box className="h-3.5 w-3.5" /> Est: {product.stock_quantity}
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Tag className="h-3.5 w-3.5" /> {product.price_type}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="p-4 pt-2 border-t border-border/20 bg-muted/20 flex gap-2">
                <Button variant="outline" size="sm" className="w-full text-xs font-bold">
                  <Eye className="mr-1 h-3.5 w-3.5" /> Detalhes RAG
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
