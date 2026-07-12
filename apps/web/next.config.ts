import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  /** Monorepo pnpm : la racine de tracing doit remonter jusqu'au repo, sinon
   *  le build standalone ne voit pas packages/* (nécessaire pour Docker). */
  outputFileTracingRoot: path.join(process.cwd(), "../.."),

  /**
   * packages/* sont consommés comme source TS brute (pas de build step) —
   * sans ça, webpack ne résout pas les imports internes en `./fichier.js`
   * vers les `.ts` correspondants et échoue avec "Module not found".
   */
  transpilePackages: ["@fidwastafid/schemas", "@fidwastafid/db", "@fidwastafid/auth"],

  /**
   * transpilePackages seul ne suffit pas : packages/* importent en interne
   * avec l'extension `.js` (convention ESM/NodeNext) alors que le fichier
   * réel est un `.ts`. webpack ne fait pas cet alias par défaut pour les
   * packages transpilés — on le déclare explicitement.
   */
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },

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
