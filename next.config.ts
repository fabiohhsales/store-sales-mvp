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
  experimental: {
    // Se algum outro proxy precisar ler o body completo, use um teto alinhado
    // com uploads de 50 MB reais enviados como JSON base64 (~66,7 MB no fio).
    proxyClientMaxBodySize: '70mb',
  },
  typescript: {
    // Docker OOM: se `next build` estourar memória no CI, adicionar
    // NODE_OPTIONS=--max-old-space-size=4096 no step de build, ou mover o
    // typecheck para um step separado com `tsc --noEmit` (passa localmente).
    ignoreBuildErrors: false,
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
