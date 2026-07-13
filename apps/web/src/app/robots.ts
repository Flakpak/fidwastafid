import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/siteUrl.js";

/**
 * Les routes noindex (CONTRAT-V1 §2) ont déjà `robots: { index: false }`
 * en metadata — ce fichier les exclut aussi du crawl (budget de crawl),
 * en complément, pas en remplacement.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/soumettre", "/connexion", "/inscription", "/api/"],
    },
    sitemap: new URL("/sitemap.xml", SITE_URL).toString(),
  };
}
