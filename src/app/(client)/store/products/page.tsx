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
import { Loader2, Plus, ShoppingBag, Tag, Box, DollarSign, Eye, AlertCircle, Upload, Download, FileSpreadsheet, Package } from 'lucide-react'
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
  description_long: string | null
}

function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = []
  let currentLine = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine)
      }
      currentLine = ''
      if (char === '\r' && text[i + 1] === '\n') {
        i++ // Skip extra newline char
      }
    } else {
      currentLine += char
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine)
  }

  if (lines.length < 2) return []

  // Detect delimiter: comma (,) or semicolon (;)
  const headerLine = lines[0]
  const commaCount = (headerLine.match(/,/g) || []).length
  const semicolonCount = (headerLine.match(/;/g) || []).length
  const delimiter = semicolonCount > commaCount ? ';' : ','

  const parseLine = (line: string): string[] => {
    const fields: string[] = []
    let currentField = ''
    let inside = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inside = !inside
      } else if (char === delimiter && !inside) {
        fields.push(currentField.trim())
        currentField = ''
      } else {
        currentField += char
      }
    }
    fields.push(currentField.trim())
    return fields.map(f => {
      if (f.startsWith('"') && f.endsWith('"')) {
        return f.slice(1, -1).trim()
      }
      return f
    })
  }

  const headers = parseLine(lines[0])
  const results: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i])
    const obj: Record<string, string> = {}
    headers.forEach((header, index) => {
      obj[header] = values[index] || ''
    })
    results.push(obj)
  }

  return results
}

export default function StoreProductsPage() {
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Dialog states
  const [open, setOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

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

  // CSV Import states
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<Record<string, string>[]>([])
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importLog, setImportLog] = useState<{ name: string; status: 'success' | 'error'; error?: string }[]>([])

  useEffect(() => {
    loadStoreAndProducts()
  }, [])

  async function loadStoreAndProducts() {
    try {
      setLoading(true)
      setError(null)
      
      const searchParams = new URLSearchParams(window.location.search)
      const clientIdParam = searchParams.get('client_id')
      setClientId(clientIdParam)

      // 1. Fetch store ID
      const settingsUrl = clientIdParam ? `/api/store/settings?client_id=${clientIdParam}` : '/api/store/settings'
      const storeRes = await fetch(settingsUrl)
      if (!storeRes.ok) throw new Error('Falha ao carregar dados da loja.')
      const storeData = await storeRes.json()
      
      if (!storeData.store) {
        setError('Você precisa configurar sua Loja na página de Configurações primeiro!')
        setProducts([])
        return
      }

      setStoreId(storeData.store.id)

      // 2. Fetch products
      const prodUrl = clientIdParam 
        ? `/api/store/products?store_id=${storeData.store.id}&client_id=${clientIdParam}` 
        : `/api/store/products?store_id=${storeData.store.id}`
      const prodRes = await fetch(prodUrl)
      if (!prodRes.ok) throw new Error('Falha ao carregar produtos.')
      const prodData = await prodRes.json()
      
      setProducts(prodData)
    } catch (err: any) {
      setError(err.message || 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploadingImage(true)
      const formData = new FormData()
      formData.append('file', file)
      if (clientId) {
        formData.append('client_id', clientId)
      }

      const res = await fetch('/api/store/products/upload-image', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Erro ao fazer upload da imagem')
      }

      const data = await res.json()
      setImageUrl(data.publicUrl)
      toast.success('Imagem enviada com sucesso!')
    } catch (err: any) {
      toast.error(err.message || 'Falha ao enviar imagem')
    } finally {
      setUploadingImage(false)
    }
  }

  function downloadCSVTemplate() {
    const headers = [
      'name',
      'category',
      'price_type',
      'price_amount',
      'description_long',
      'stock_quantity',
      'pickup_available',
      'delivery_available',
      'assembly_included',
      'delivery_region',
      'main_image_url'
    ]
    const rows = [
      [
        'Roupeiro Joinville 6 portas',
        'Móveis > Quarto > Roupeiro',
        'fixed',
        '899.90',
        'Roupeiro Joinville de madeira com 6 portas, 3 gavetas e espelho central.',
        '5',
        'true',
        'true',
        'false',
        'Leopoldina e região',
        'https://exemplo.com/imagem.jpg'
      ]
    ]
    const csvContent = [
      headers.join(','),
      rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(',')).join('\n')
    ].join('\n')
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', 'template_produtos.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setCsvFile(file)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      try {
        const parsed = parseCSV(text)
        if (parsed.length === 0) {
          toast.error('Nenhum dado encontrado no CSV ou arquivo inválido.')
          setCsvData([])
          return
        }
        const firstRow = parsed[0]
        if (!('name' in firstRow)) {
          toast.error('Coluna obrigatória "name" não encontrada no CSV.')
          setCsvData([])
          return
        }
        setCsvData(parsed)
        toast.success(`${parsed.length} produtos carregados do CSV. Pronto para importar!`)
      } catch (err: any) {
        toast.error('Falha ao processar CSV: ' + err.message)
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImportCSV() {
    if (!storeId || csvData.length === 0) return

    try {
      setImporting(true)
      setImportProgress(0)
      setImportLog([])

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i]
        const productName = row.name || `Produto #${i + 1}`

        try {
          const pickup = row.pickup_available === 'true' || row.pickup_available === '1' || row.pickup_available === '' || !row.pickup_available
          const delivery = row.delivery_available === 'true' || row.delivery_available === '1' || row.delivery_available === '' || !row.delivery_available
          const assembly = row.assembly_included === 'true' || row.assembly_included === '1' || row.assembly_included === '' || !row.assembly_included

          const res = await fetch('/api/store/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: clientId || undefined,
              store_id: storeId,
              name: row.name,
              category: row.category || 'Móveis',
              price_type: row.price_type || 'fixed',
              price_amount: row.price_amount ? Number(row.price_amount) : null,
              description_long: row.description_long || '',
              stock_quantity: row.stock_quantity ? Number(row.stock_quantity) : 10,
              pickup_available: pickup,
              delivery_available: delivery,
              assembly_included: assembly,
              delivery_region: row.delivery_region || 'Leopoldina e região',
              main_image_url: row.main_image_url || null,
            }),
          })

          if (!res.ok) {
            const errJson = await res.json()
            throw new Error(errJson.error || 'Erro na API')
          }

          setImportLog(prev => [...prev, { name: productName, status: 'success' }])
        } catch (err: any) {
          console.error(`Erro ao importar produto ${productName}:`, err)
          setImportLog(prev => [...prev, { name: productName, status: 'error', error: err.message || 'Erro desconhecido' }])
        }

        setImportProgress(Math.round(((i + 1) / csvData.length) * 100))
      }

      toast.success('Processamento do CSV concluído!')
      loadStoreAndProducts()
    } catch (err: any) {
      toast.error('Erro na importação: ' + err.message)
    } finally {
      setImporting(false)
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
          client_id: clientId || undefined,
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCsvOpen(true)} className="font-bold border-border/60">
              <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" /> Importar CSV
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={
                <Button className="font-bold shadow-lg shadow-primary/20">
                  <Plus className="mr-2 h-4 w-4" /> Novo Produto
                </Button>
              } />
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
                      <Select value={priceType} onValueChange={(val) => setPriceType(val || 'fixed')}>
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
                    <Label htmlFor="image-url">Imagem do Produto</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        id="image-url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="Ex: https://image.com/foto.jpg"
                        className="flex-grow"
                      />
                      <div className="relative">
                        <Input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="image-file-upload"
                          onChange={handleImageUpload}
                          disabled={uploadingImage}
                        />
                        <Label
                          htmlFor="image-file-upload"
                          className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-9 px-4 cursor-pointer ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          {uploadingImage ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-1" />
                              Upload
                            </>
                          )}
                        </Label>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Insira uma URL direta ou envie uma imagem (JPG, PNG, WEBP, GIF até 10MB)</p>
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

            {/* CSV Import Dialog */}
            <Dialog open={csvOpen} onOpenChange={(val) => {
              if (!importing) {
                setCsvOpen(val)
                if (!val) {
                  setCsvFile(null)
                  setCsvData([])
                  setImportProgress(0)
                  setImportLog([])
                }
              }
            }}>
              <DialogContent className="max-w-xl bg-card border-border/40 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Importar Catálogo via Planilha CSV</DialogTitle>
                  <DialogDescription>
                    Envie um arquivo CSV com seus produtos. Os produtos importados serão indexados automaticamente no RAG da IA.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-muted/30 p-3 rounded-lg border">
                    <div className="space-y-1">
                      <p className="text-xs font-bold">Planilha de Exemplo (Modelo)</p>
                      <p className="text-[10px] text-muted-foreground">Baixe o modelo pré-formatado para preencher seus dados.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={downloadCSVTemplate} className="text-xs font-bold">
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Baixar Modelo
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Selecione o arquivo CSV</Label>
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvFileChange}
                      disabled={importing}
                    />
                  </div>

                  {csvData.length > 0 && (
                    <div className="bg-muted/20 border p-3 rounded-lg text-xs space-y-2">
                      <p className="font-bold flex items-center justify-between text-foreground">
                        <span>Resumo do arquivo carregado:</span>
                        <span className="bg-primary/10 border border-primary/20 px-2 py-0.5 rounded text-primary font-black">
                          {csvData.length} produtos
                        </span>
                      </p>
                      <div className="max-h-[150px] overflow-y-auto border border-border/30 rounded bg-background/50 divide-y divide-border/20">
                        {csvData.slice(0, 5).map((row, idx) => (
                          <div key={idx} className="p-2 flex justify-between gap-4">
                            <span className="font-medium text-foreground truncate">{row.name}</span>
                            <span className="text-muted-foreground font-mono">{row.price_amount ? `R$ ${row.price_amount}` : 'Sob consulta'}</span>
                          </div>
                        ))}
                        {csvData.length > 5 && (
                          <div className="p-2 text-center text-muted-foreground italic">
                            ...e mais {csvData.length - 5} produtos.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {importing && (
                    <div className="space-y-2 bg-muted/40 p-4 border rounded-lg">
                      <div className="flex justify-between text-xs font-bold text-foreground">
                        <span>Progresso da Importação</span>
                        <span>{importProgress}%</span>
                      </div>
                      <div className="w-full bg-border rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ width: `${importProgress}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-1 animate-pulse">
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                        <span>
                          Importando produto {importLog.length + 1} de {csvData.length}... (
                          {csvData[importLog.length]?.name || 'carregando'}
                          )
                        </span>
                      </div>
                    </div>
                  )}

                  {importLog.length > 0 && (
                    <div className="bg-muted/10 border rounded-lg p-3 space-y-2">
                      <p className="text-xs font-bold text-foreground">Logs de Importação:</p>
                      <div className="max-h-[150px] overflow-y-auto divide-y divide-border/20 border border-border/20 rounded bg-background/50 text-[10px] font-mono">
                        {importLog.map((log, idx) => (
                          <div key={idx} className="p-1.5 flex justify-between items-center gap-4">
                            <span className="truncate max-w-[250px] font-medium text-foreground">{log.name}</span>
                            {log.status === 'success' ? (
                              <span className="text-emerald-500 font-bold bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">Sucesso</span>
                            ) : (
                              <span className="text-destructive font-bold bg-destructive/10 px-1 py-0.2 rounded border border-destructive/20 truncate max-w-[150px]" title={log.error}>
                                Erro: {log.error}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-border/20">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCsvOpen(false)}
                      disabled={importing}
                    >
                      {importLog.length > 0 ? 'Fechar' : 'Cancelar'}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleImportCSV}
                      disabled={importing || csvData.length === 0}
                    >
                      {importing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        'Iniciar Importação'
                      )}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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
            <Card key={product.id} className="border border-border/40 bg-card/40 hover:bg-card/70 transition-all flex flex-col justify-between overflow-hidden rounded-xl">
              {product.main_image_url ? (
                <div className="relative w-full h-48 overflow-hidden bg-muted/10 border-b border-border/10">
                  <img
                    src={product.main_image_url}
                    alt={product.name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                </div>
              ) : (
                <div className="relative w-full h-48 bg-muted/20 flex items-center justify-center border-b border-border/10">
                  <Package className="h-12 w-12 text-muted-foreground/30" />
                </div>
              )}
              
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
