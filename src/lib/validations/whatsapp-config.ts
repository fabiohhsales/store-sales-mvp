import { z } from 'zod/v4'

const connectionStatusValues = ['open', 'connecting', 'disconnected'] as const

export const whatsappConfigInsertSchema = z.object({
  client_id: z.uuid(),
  evolution_instance_name: z.string().min(1, 'Nome da instancia e obrigatorio'),
  evolution_instance_id: z.string().nullable().optional(),
  evolution_instance_token: z.string().nullable().optional(),
  connection_status: z.enum(connectionStatusValues).optional(),
  connected_phone: z.string().nullable().optional(),
  connected_at: z.string().nullable().optional(),
  disconnected_at: z.string().nullable().optional(),
  webhook_url: z.string().url().nullable().optional(),
  chatwoot_inbox_id: z.number().int().nullable().optional(),
})

export const whatsappConfigUpdateSchema = z.object({
  evolution_instance_name: z.string().min(1).optional(),
  evolution_instance_id: z.string().nullable().optional(),
  evolution_instance_token: z.string().nullable().optional(),
  connection_status: z.enum(connectionStatusValues).optional(),
  connected_phone: z.string().nullable().optional(),
  connected_at: z.string().nullable().optional(),
  disconnected_at: z.string().nullable().optional(),
  webhook_url: z.string().url().nullable().optional(),
  chatwoot_inbox_id: z.number().int().nullable().optional(),
})

export type WhatsAppConfigInsert = z.infer<typeof whatsappConfigInsertSchema>
export type WhatsAppConfigUpdate = z.infer<typeof whatsappConfigUpdateSchema>
