'use client'

import Link from 'next/link'
import { LogOut, User, Search, Plus, Bell } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logout } from '@/lib/actions/auth'
import { MobileNav } from './mobile-nav'

interface HeaderProps {
  userEmail: string
}

export function Header({ userEmail }: HeaderProps) {
  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <MobileNav />
        <div className="relative w-80 hidden md:block">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full pl-10 pr-4 py-2 rounded-md bg-secondary border-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/clients/new"
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity active:scale-[0.97]"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Novo Cliente</span>
        </Link>

        <button className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Bell size={18} />
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-border">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary transition-colors">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                <User size={16} className="text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground hidden lg:inline">
                {userEmail}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{userEmail}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => logout()}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
