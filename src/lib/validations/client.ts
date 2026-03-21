import { z } from 'zod/v4'

const clientStatusValues = [
  'draft',
  'pending_whatsapp',
  'pending_google',
  'configuring',
  'active',
  'paused',
  'disconnected',
] as const

export const clientInsertSchema = z.object({
  name: z.string().min(1, 'Nome do negocio e obrigatorio'),
  owner_name: z.string().min(1, 'Nome do responsavel e obrigatorio'),
  phone: z.string().nullable().optional(),
  email: z.email('Email invalido'),
  status: z.enum(clientStatusValues).optional(),
})

export const clientUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  owner_name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  email: z.email().optional(),
  status: z.enum(clientStatusValues).optional(),
})

export type ClientInsert = z.infer<typeof clientInsertSchema>
export type ClientUpdate = z.infer<typeof clientUpdateSchema>
