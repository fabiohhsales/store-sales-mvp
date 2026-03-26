import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Type checking é feito localmente — evita OOM no build da VPS
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
