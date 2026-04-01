'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getNavItems, type LayoutAudience } from './nav-config'

interface SidebarProps {
  audience: LayoutAudience
}

export function Sidebar({ audience }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const navItems = getNavItems(audience)

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
