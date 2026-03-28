'use client'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search } from 'lucide-react'

interface PipelineFiltersProps {
  statusFilter: string
  onStatusChange: (status: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  totalCount: number
}

export function PipelineFilters({
  statusFilter,
  onStatusChange,
  searchQuery,
  onSearchChange,
  totalCount,
}: PipelineFiltersProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="pending">Pendente</SelectItem>
          <SelectItem value="open">Aberto</SelectItem>
          <SelectItem value="resolved">Resolvido</SelectItem>
        </SelectContent>
      </Select>

      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8"
        />
      </div>

      <span className="text-sm text-muted-foreground ml-auto">
        {totalCount} conversa{totalCount !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
