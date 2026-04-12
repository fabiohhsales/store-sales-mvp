'use client'

import { ClipboardList, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  customData: Record<string, string> | null
  intakeCompletedAt: string | null
  editing: boolean
  saving: boolean
  customDataDraft: Record<string, string>
  onToggleEdit: () => void
  onCustomDataDraftChange: (key: string, value: string) => void
  onSave: () => void
  onClearIntake: () => void
}

export function ConversationIntakeCard({
  customData,
  intakeCompletedAt,
  editing,
  saving,
  customDataDraft,
  onToggleEdit,
  onCustomDataDraftChange,
  onSave,
  onClearIntake,
}: Props) {
  const entries = customData
    ? Object.entries(customData).filter(([k]) => !k.startsWith('_'))
    : []

  const completionBadge = intakeCompletedAt
    ? { label: 'Concluído', classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' }
    : entries.length > 0
      ? { label: 'Em andamento', classes: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' }
      : null

  if (entries.length === 0 && !intakeCompletedAt) {
    return (
      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <ClipboardList size={14} />
          <span className="text-xs">Nenhum dado de intake coletado</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-background p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={14} className="text-primary" />
          <span className="text-xs font-medium">Dados coletados</span>
          {completionBadge && (
            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${completionBadge.classes}`}>
              {completionBadge.label}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs px-2"
          onClick={onToggleEdit}
        >
          <Pencil size={10} className="mr-1" />
          {editing ? 'Cancelar' : 'Editar'}
        </Button>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col min-w-0">
            <span className="text-muted-foreground capitalize truncate">{key.replace(/_/g, ' ')}</span>
            {editing ? (
              <Input
                value={customDataDraft[key] ?? value ?? ''}
                onChange={(e) => onCustomDataDraftChange(key, e.target.value)}
                className="h-6 text-xs mt-0.5"
              />
            ) : (
              <span className="text-foreground font-medium truncate">
                {!value || value === '_skipped' ? '—' : value}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      {editing && (
        <div className="flex items-center justify-between pt-2 border-t">
          <button
            onClick={onClearIntake}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            title="Limpar intake (para testes)"
          >
            <Trash2 size={11} />
            Limpar
          </button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? <Loader2 size={12} className="mr-1 animate-spin" /> : null}
            Salvar
          </Button>
        </div>
      )}
    </div>
  )
}
