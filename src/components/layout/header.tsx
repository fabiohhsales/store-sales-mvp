'use client'

import { LogOut, User, Search, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
    <header className="flex h-16 items-center justify-between border-b bg-white px-4 lg:px-6 shadow-sm z-10">
      <div className="flex items-center gap-3 w-1/3">
        <MobileNav />
      </div>
      
      <div className="flex-1 flex justify-center max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input 
            className="w-full bg-zinc-100/50 border-transparent focus-visible:ring-zinc-300 focus-visible:bg-white pl-9 rounded-full" 
            placeholder="Buscar no Pipedrive..." 
            type="search" 
          />
        </div>
      </div>

      <div className="flex items-center gap-3 w-1/3 justify-end">
        <Button className="bg-[#00a651] hover:bg-[#008f45] text-white rounded-full h-9 px-4 hidden sm:flex">
          <Plus className="mr-1 h-4 w-4" /> Negócio
        </Button>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent">
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">{userEmail}</span>
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
    </header>
  )
}
