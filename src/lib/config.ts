/**
 * Returns the public Chatwoot URL without trailing slash.
 * Safe to use in both client and server components (NEXT_PUBLIC_ prefix).
 */
export function getChatwootPublicUrl(): string {
  return process.env.NEXT_PUBLIC_CHATWOOT_URL?.replace(/\/$/, '') ?? ''
}
