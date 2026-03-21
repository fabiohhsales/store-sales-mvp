'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/settings', label: 'Configurações', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden w-16 shrink-0 border-r border-[#3a4055] bg-[#2d3142] text-zinc-300 lg:flex lg:flex-col group hover:w-64 transition-all duration-300 z-20">
      <div className="flex h-16 items-center justify-center border-b border-[#3a4055] px-2 group-hover:px-6 group-hover:justify-start">
        <span className="text-xl font-bold tracking-tight text-white hidden group-hover:block">Pipedrive Clone</span>
        <span className="text-xl font-bold tracking-tight text-white block group-hover:hidden">P</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#40465c] text-white'
                  : 'text-zinc-400 hover:bg-[#3a4055] hover:text-zinc-100'
              )}
              title={item.label}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className="hidden group-hover:block truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
