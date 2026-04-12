// Rate limiter in-memory com sliding window por IP.
// Limites são por minuto. Resets no redeploy (aceitável para esta escala).

interface WindowEntry {
  timestamps: number[]
}

const windows = new Map<string, WindowEntry>()

const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 min
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now

  const cutoff = now - 60_000
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)
    if (entry.timestamps.length === 0) windows.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
}

export function checkRateLimit(
  ip: string,
  limit: number = 60,
  windowMs: number = 60_000
): RateLimitResult {
  cleanup()

  const now = Date.now()
  const cutoff = now - windowMs
  const key = `${ip}:${limit}`

  let entry = windows.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    windows.set(key, entry)
  }

  entry.timestamps = entry.timestamps.filter((t) => t > cutoff)

  if (entry.timestamps.length >= limit) {
    return { allowed: false, remaining: 0, limit }
  }

  entry.timestamps.push(now)
  return { allowed: true, remaining: limit - entry.timestamps.length, limit }
}

// Limites por categoria de rota
export const RATE_LIMITS = {
  default: 60,        // 60 req/min por IP
  send: 20,           // send message / send-media
  analytics: 10,      // stats, sla, analytics, export
} as const
