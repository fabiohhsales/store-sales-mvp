export interface CachedQrCode {
  base64: string | null
  pairingCode: string | null
  createdAt: number
}

const qrCodeCache = new Map<string, CachedQrCode>()
const DEFAULT_TTL_MS = 60_000

export function getCachedQrCode(instanceName: string, ttlMs = DEFAULT_TTL_MS): CachedQrCode | null {
  const entry = qrCodeCache.get(instanceName)
  if (!entry) return null

  if (Date.now() - entry.createdAt > ttlMs) {
    qrCodeCache.delete(instanceName)
    return null
  }

  return entry
}

export function setCachedQrCode(
  instanceName: string,
  payload: Omit<CachedQrCode, 'createdAt'>
) {
  const entry: CachedQrCode = {
    ...payload,
    createdAt: Date.now(),
  }
  qrCodeCache.set(instanceName, entry)
  return entry
}

export function clearCachedQrCode(instanceName: string) {
  qrCodeCache.delete(instanceName)
}
