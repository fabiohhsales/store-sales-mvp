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

export type ConversationJoinedRow = {
  contacts?: ConversationContactRow[] | null
  panel_clients?: {
    panel_whatsapp_config?: { evolution_instance_name: string | null }[] | null
  } | null
}

export function extractEvolutionInstanceName(
  row: ConversationJoinedRow | unknown
): string | null {
  const r = row as ConversationJoinedRow
  return r?.panel_clients?.panel_whatsapp_config?.[0]?.evolution_instance_name ?? null
}

export function extractFirstContact(
  row: ConversationJoinedRow | unknown
): ConversationContactRow | null {
  const r = row as ConversationJoinedRow
  return r?.contacts?.[0] ?? null
}
