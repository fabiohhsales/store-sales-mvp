'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Menu,
  LayoutDashboard,
  Users,
  Settings,
  Kanban,
  Shield,
  Calendar,
  ToggleLeft,
  ToggleRight,
  UserCircle,
  MessageSquare,
} from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const adminNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/settings', label: 'Configurações', icon: Settings },
  { href: '/soc', label: 'SOC', icon: Shield },
]

const clientNavItems = [
  { href: '/desk', label: 'Desk', icon: MessageSquare },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/account', label: 'Minha Conta', icon: UserCircle },
]

export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'admin' | 'client'>('admin')

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-mode')
    if (saved === 'client' || saved === 'admin') setMode(saved)
  }, [])

  function toggleMode() {
    const newMode = mode === 'admin' ? 'client' : 'admin'
    setMode(newMode)
    localStorage.setItem('sidebar-mode', newMode)
  }

  const navItems = mode === 'admin' ? adminNavItems : clientNavItems

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="inline-flex items-center justify-center rounded-md p-2 hover:bg-accent lg:hidden">
        <Menu className="h-5 w-5" />
        <span className="sr-only">Menu</span>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0" style={{ background: 'var(--sidebar)' }}>
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="text-lg font-bold text-primary">
            Sales Tec
          </SheetTitle>
        </SheetHeader>

        {/* Toggle admin/client */}
        <button
          onClick={toggleMode}
          className="flex items-center gap-2 mx-3 mt-3 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors w-[calc(100%-1.5rem)]"
        >
          {mode === 'admin' ? (
            <ToggleRight size={16} className="text-primary" />
          ) : (
            <ToggleLeft size={16} />
          )}
          {mode === 'admin' ? 'Admin' : 'Client'}
        </button>

        <nav className="space-y-1 px-3 py-2">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
