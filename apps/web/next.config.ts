import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  /** Monorepo pnpm : la racine de tracing doit remonter jusqu'au repo, sinon
   *  le build standalone ne voit pas packages/* (nécessaire pour Docker). */
  outputFileTracingRoot: path.join(process.cwd(), "../.."),

  /**
   * En-têtes statiques (pas de valeur par requête ici). Le CSP a besoin d'un
   * nonce par requête — il vit dans middleware.ts, pas ici (voir ce fichier
   * pour le détail du choix).
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
