import type { NextConfig } from "next";

// Domínio do Chatwoot self-hosted (ex: https://chat.exemplo.com).
// Precisa estar definido em CHATWOOT_URL para que o CSP frame-ancestors
// permita que o Chatwoot renderize os iframes de Dashboard Apps.
const chatwootOrigin = (process.env.CHATWOOT_URL ?? '').replace(/\/$/, '')

const nextConfig: NextConfig = {
  typescript: {
    // Type checking é feito localmente — evita OOM no build da VPS
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
            value: `frame-ancestors 'self'${chatwootOrigin ? ` ${chatwootOrigin}` : ''}`,
          },
        ],
      },
    ]
  },
};

export default nextConfig;
