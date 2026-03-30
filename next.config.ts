import type { NextConfig } from "next";

function normalizeOrigin(rawUrl?: string): string | null {
  if (!rawUrl) return null
  try {
    return new URL(rawUrl).origin
  } catch {
    return null
  }
}

// Permite tanto a origem interna usada pelo servidor quanto a origem pública
// acessada pelo navegador ao embutir os Dashboard Apps do Chatwoot.
const chatwootFrameAncestors = Array.from(
  new Set(
    [
      normalizeOrigin(process.env.CHATWOOT_URL),
      normalizeOrigin(process.env.NEXT_PUBLIC_CHATWOOT_URL),
    ].filter((value): value is string => Boolean(value))
  )
)

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        // Restringe embedding às origens confiáveis: próprio painel e o Chatwoot self-hosted
        source: '/chatwoot/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors 'self'${chatwootFrameAncestors.length ? ` ${chatwootFrameAncestors.join(' ')}` : ''}`,
          },
        ],
      },
    ]
  },
};

export default nextConfig;
