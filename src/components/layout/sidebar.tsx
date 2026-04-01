'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Kanban,
  Shield,
  Calendar,
  ToggleLeft,
  ToggleRight,
  UserCircle,
  MessageSquare,
  Send,
} from 'lucide-react'

const adminNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/followups', label: 'Follow Ups', icon: Send },
  { href: '/settings', label: 'Configurações', icon: Settings },
  { href: '/soc', label: 'SOC', icon: Shield },
]

const clientNavItems = [
  { href: '/desk', label: 'Desk', icon: MessageSquare },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/followups', label: 'Follow Ups', icon: Send },
  { href: '/account', label: 'Minha Conta', icon: UserCircle },
]

interface SidebarProps {
  forcedMode?: 'admin' | 'client'
}

export function Sidebar({ forcedMode }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [storedMode, setStoredMode] = useState<'admin' | 'client'>(() => {
    if (typeof window === 'undefined') return 'admin'
    const saved = localStorage.getItem('sidebar-mode')
    return saved === 'client' ? 'client' : 'admin'
  })
  const mode = forcedMode ?? storedMode

  function toggleMode() {
    if (forcedMode) return
    const newMode = mode === 'admin' ? 'client' : 'admin'
    setStoredMode(newMode)
    localStorage.setItem('sidebar-mode', newMode)
  }

  const navItems = mode === 'admin' ? adminNavItems : clientNavItems

  return (
    <aside
      className="hidden h-screen flex-col border-r border-border transition-all duration-300 relative lg:flex"
      style={{
        width: collapsed ? 60 : 220,
        background: 'var(--sidebar)',
      }}
    >
      <div className="flex h-14 items-center justify-center border-b border-border">
        <span className="text-lg font-bold tracking-tight text-primary">
          {collapsed ? 'S' : 'Sales Tec'}
        </span>
      </div>

      {/* Toggle admin/client */}
      {!collapsed && !forcedMode && (
        <button
          onClick={toggleMode}
          className="flex items-center gap-2 mx-2 mt-3 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          {mode === 'admin' ? (
            <ToggleRight size={16} className="text-primary" />
          ) : (
            <ToggleLeft size={16} />
          )}
          {mode === 'admin' ? 'Admin' : 'Client'}
        </button>
      )}

      <nav className="flex-1 py-2 px-2 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-item ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  )
}
