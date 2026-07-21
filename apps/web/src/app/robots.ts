import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/siteUrl.js";

/**
 * Les routes noindex (CONTRAT-V1 §2) ont déjà `robots: { index: false }`
 * en metadata — ce fichier les exclut aussi du crawl (budget de crawl),
 * en complément, pas en remplacement.
 *
 * Lot GEO du 21/07/2026 (constat par curl du robots.txt prod) :
 * - `/compte` ajouté au disallow — espace privé authentifié (CONTRAT-V1 §4),
 *   absent jusqu'ici alors que /admin, /connexion etc. y étaient déjà.
 * - Blocs explicites `Allow: /` pour les crawlers IA (même disallow que
 *   `*`) : ils étaient déjà servis (aucun blocage constaté par test UA sur
 *   GPTBot/ClaudeBot/PerplexityBot), mais seulement via le silence de la
 *   règle `*` — un audit du robots.txt ne peut pas distinguer "autorisé
 *   sciemment" de "oublié". Rendre la politique explicite ne change rien
 *   au comportement réel, seulement à ce qu'un audit peut constater.
 */
const DISALLOW = ["/admin", "/soumettre", "/connexion", "/inscription", "/auth/", "/api/", "/compte"];

const CRAWLERS_IA = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...CRAWLERS_IA.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
  };
}
