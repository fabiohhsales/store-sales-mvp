import { KanbanBoard } from '@/components/dashboard/kanban-board'

export default function DealsPage() {
  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800">Sales Pipeline</h1>
          <span className="text-sm text-zinc-500 ml-2 border-l border-zinc-300 pl-2">12 deals</span>
          <span className="text-sm text-zinc-500 font-medium">· $45,000</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-x-auto pb-4">
        <KanbanBoard />
      </div>
    </div>
  )
}
