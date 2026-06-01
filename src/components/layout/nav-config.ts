import {
  Calendar,
  Kanban,
  LayoutDashboard,
  MessageSquare,
  Send,
  Settings,
  Shield,
  UserCircle,
  Users,
  ShoppingBag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type LayoutAudience = 'admin' | 'client'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const adminNavItems: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/settings', label: 'Configuracoes', icon: Settings },
  { href: '/soc', label: 'SOC', icon: Shield },
]

export const clientNavItems: NavItem[] = [
  { href: '/desk', label: 'Desk', icon: MessageSquare },
  { href: '/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/agenda', label: 'Agenda', icon: Calendar },
  { href: '/followups', label: 'Follow Ups', icon: Send },
  { href: '/store/products', label: 'Loja Catálogo', icon: ShoppingBag },
  { href: '/store/settings', label: 'Loja Config', icon: Settings },
  { href: '/account', label: 'Minha Conta', icon: UserCircle },
]

export function getNavItems(audience: LayoutAudience) {
  return audience === 'admin' ? adminNavItems : clientNavItems
}
