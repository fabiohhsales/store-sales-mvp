import { z } from 'zod/v4'

export const googleConfigInsertSchema = z.object({
  client_id: z.uuid(),
  google_email: z.string().nullable().optional(),
  calendar_id: z.string().nullable().optional(),
  access_token: z.string().nullable().optional(),
  refresh_token: z.string().nullable().optional(),
  token_expiry: z.string().nullable().optional(),
  scopes: z.array(z.string()).optional(),
  authorized_at: z.string().nullable().optional(),
})

export const googleConfigUpdateSchema = z.object({
  google_email: z.string().nullable().optional(),
  calendar_id: z.string().nullable().optional(),
  access_token: z.string().nullable().optional(),
  refresh_token: z.string().nullable().optional(),
  token_expiry: z.string().nullable().optional(),
  scopes: z.array(z.string()).optional(),
  authorized_at: z.string().nullable().optional(),
})

export type GoogleConfigInsert = z.infer<typeof googleConfigInsertSchema>
export type GoogleConfigUpdate = z.infer<typeof googleConfigUpdateSchema>
