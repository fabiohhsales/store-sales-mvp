'use client'

import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ClientOption {
  id: string
  name: string
}

interface ClientSelectorProps {
  value: string
  onChange: (clientId: string) => void
}

export function ClientSelector({ value, onChange }: ClientSelectorProps) {
  const [clients, setClients] = useState<ClientOption[]>([])

  useEffect(() => {
    fetch('/api/clients')
      .then((res) => res.json())
      .then((data) => {
        const options = (data as Record<string, unknown>[])
          .filter((c) => c.status === 'active' || c.status === 'paused')
          .map((c) => ({ id: c.id as string, name: c.name as string }))
        setClients(options)
        if (!value && options.length > 0) {
          onChange(options[0].id)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[260px]">
        <SelectValue placeholder="Selecione um cliente" />
      </SelectTrigger>
      <SelectContent>
        {clients.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
