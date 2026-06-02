'use client'

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  onSuccess?: () => void
}

export function ImportContactsDialog({ open, onOpenChange, clientId, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [csvText, setCsvText] = useState<string>('')
  const [parsedRows, setParsedRows] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Por favor, selecione apenas arquivos CSV.')
      return
    }

    setFile(selectedFile)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setCsvText(text)
      
      // Parse first few rows for preview
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      if (lines.length > 1) {
        const separator = lines[0].includes(';') ? ';' : ','
        const headers = lines[0].split(separator).map(h => h.trim().replace(/['"]/g, ''))
        const rows = lines.slice(1, 6).map(line => {
          const values = line.split(separator).map(v => v.trim().replace(/^['"]|['"]$/g, ''))
          const obj: Record<string, string> = {}
          headers.forEach((h, idx) => {
            obj[h] = values[idx] || ''
          })
          return obj
        })
        setParsedRows(rows)
      } else {
        setParsedRows([])
      }
    }
    reader.readAsText(selectedFile)
  }

  const handleDownloadTemplate = () => {
    const csvContent = 'Nome;Telefone;Email;Cidade;Estado;Tags\nMaria Silva;5531999999999;maria@email.com;Belo Horizonte;MG;cliente|vip\nJoão Souza;5511988888888;joao@email.com;São Paulo;SP;lead\n'
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', 'template_importar_contatos.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleImport = async () => {
    if (!csvText) return
    setUploading(true)
    try {
      const res = await fetch('/api/store/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success('Importação concluída com sucesso!')
        setResult({
          imported: data.imported,
          skipped: data.skipped,
        })
        if (onSuccess) onSuccess()
      } else {
        toast.error(data.error || 'Erro ao importar contatos')
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro de rede ao importar contatos')
    } finally {
      setUploading(false)
    }
  }

  const resetState = () => {
    setFile(null)
    setCsvText('')
    setParsedRows([])
    setResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      onOpenChange(val)
      if (!val) resetState()
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Contatos via Planilha
          </DialogTitle>
          <DialogDescription>
            Suba uma lista de clientes em formato CSV para cadastrar em massa e iniciar campanhas.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-2">
            {/* Upload Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center border-2 border-dashed border-border/80 rounded-xl p-8 cursor-pointer hover:border-primary/40 bg-background/30 hover:bg-background/50 transition-all gap-2 text-center"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-semibold">
                {file ? file.name : 'Selecione o arquivo CSV'}
              </span>
              <span className="text-xs text-muted-foreground">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Arraste ou clique para buscar'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                hidden
                onChange={handleFileChange}
              />
            </div>

            {/* Template Downloader */}
            <div className="flex items-center justify-between text-xs bg-secondary/50 rounded-lg p-3 border border-border/40">
              <span className="text-muted-foreground font-medium">Use nossa planilha modelo</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary font-bold hover:text-primary gap-1"
                onClick={handleDownloadTemplate}
              >
                <Download size={13} />
                Baixar Modelo
              </Button>
            </div>

            {/* Row Preview */}
            {parsedRows.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  Pré-visualização (linhas iniciais):
                </span>
                <div className="rounded-lg border border-border/40 overflow-hidden max-h-36 overflow-y-auto bg-background/25">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary/40 border-b border-border/40 text-muted-foreground">
                        <th className="p-2 font-semibold">Nome</th>
                        <th className="p-2 font-semibold">Telefone</th>
                        <th className="p-2 font-semibold">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row, idx) => (
                        <tr key={idx} className="border-b border-border/30 last:border-0">
                          <td className="p-2 truncate max-w-[120px]">{row.nome || row.name || '-'}</td>
                          <td className="p-2">{row.telefone || row.phone || row.whatsapp || '-'}</td>
                          <td className="p-2 truncate max-w-[120px]">{row.email || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-4 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 animate-bounce" />
            <h3 className="font-bold text-lg">Importação Finalizada!</h3>
            
            <div className="grid grid-cols-2 gap-4 w-full max-w-xs mt-2">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                <p className="text-2xl font-black text-green-600">{result.imported}</p>
                <p className="text-xs text-muted-foreground font-medium">Contatos Importados</p>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                <p className="text-2xl font-black text-amber-600">{result.skipped}</p>
                <p className="text-xs text-muted-foreground font-medium">Contatos Pulados</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1 px-4">
              Telefones duplicados, vazios ou inválidos foram ignorados automaticamente.
            </p>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleImport}
                disabled={!file || uploading}
                className="font-bold"
              >
                {uploading ? (
                  <>
                    <Loader2 size={15} className="animate-spin mr-2" />
                    Processando...
                  </>
                ) : (
                  'Confirmar Importação'
                )}
              </Button>
            </>
          ) : (
            <Button className="w-full font-bold" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
