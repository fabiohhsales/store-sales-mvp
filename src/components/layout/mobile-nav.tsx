'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, LayoutDashboard, Users, Settings, Kanban } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/deals', label: 'Negócios', icon: Kanban },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

export function MobileNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

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
        <nav className="space-y-1 px-3 py-4">
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
