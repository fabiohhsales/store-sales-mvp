'use client'

import { cn } from '@/lib/utils'

interface TimelineItem {
  id: string
  label: string
  detail?: string | null
  timestamp: string
  color?: string // tailwind color stem: 'red', 'blue', 'emerald' etc.
}

interface TimelineProps {
  items: TimelineItem[]
  className?: string
}

const DOT_COLORS: Record<string, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-500',
  sky: 'bg-sky-500',
}

const TEXT_COLORS: Record<string, string> = {
  red: 'text-red-600 dark:text-red-400',
  blue: 'text-blue-600 dark:text-blue-400',
  amber: 'text-amber-600 dark:text-amber-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  violet: 'text-violet-600 dark:text-violet-400',
  sky: 'text-sky-600 dark:text-sky-400',
}

export function Timeline({ items, className }: TimelineProps) {
  if (items.length === 0) return null

  return (
    <div className={cn('relative', className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        const dotColor = DOT_COLORS[item.color ?? ''] ?? 'bg-muted-foreground'
        const textColor = TEXT_COLORS[item.color ?? ''] ?? 'text-muted-foreground'

        return (
          <div key={item.id} className="relative flex gap-3 pb-3 last:pb-0">
            {/* Vertical line + dot */}
            <div className="flex flex-col items-center">
              <div className={`h-2 w-2 rounded-full flex-shrink-0 mt-1 ${dotColor}`} />
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 -mt-0.5">
              <p className={`text-xs font-medium leading-snug ${textColor}`}>
                {item.label}
              </p>
              {item.detail && (
                <p className="text-[10px] text-muted-foreground leading-snug mt-0.5 truncate">
                  {item.detail}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {item.timestamp}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
