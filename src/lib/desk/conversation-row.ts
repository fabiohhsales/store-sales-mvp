// Shared accessors for the joined conversations row used by desk routes.
//
// Three desk routes (`message`, `send-media`, `media`) load a `conversations`
// row with `contacts` and `panel_clients.panel_whatsapp_config` joined and
// previously each one repeated the same `as unknown as { ... }` cast inline.
// Encapsulating the shape here gives a single point of change if the join
// schema ever evolves.

export type ConversationContactRow = {
  phone_number: string | null
  identifier: string | null
}

type WhatsAppConfigRow = { evolution_instance_name: string | null }

// PostgREST returns arrays for one-to-many and single objects for
// many-to-one FK joins. Guard against both shapes.
export type ConversationJoinedRow = {
  contacts?: ConversationContactRow | ConversationContactRow[] | null
  panel_clients?: {
    panel_whatsapp_config?: WhatsAppConfigRow | WhatsAppConfigRow[] | null
  } | {
    panel_whatsapp_config?: WhatsAppConfigRow | WhatsAppConfigRow[] | null
  }[] | null
}

export function extractEvolutionInstanceName(
  row: ConversationJoinedRow | unknown
): string | null {
  const r = row as ConversationJoinedRow
  const pc = Array.isArray(r?.panel_clients) ? r.panel_clients[0] : r?.panel_clients
  const wc = Array.isArray(pc?.panel_whatsapp_config) ? pc.panel_whatsapp_config[0] : pc?.panel_whatsapp_config
  return wc?.evolution_instance_name ?? null
}

export function extractFirstContact(
  row: ConversationJoinedRow | unknown
): ConversationContactRow | null {
  const r = row as ConversationJoinedRow
  return Array.isArray(r?.contacts) ? r.contacts[0] ?? null : r?.contacts ?? null
}
