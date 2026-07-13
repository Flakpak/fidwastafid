import type { Deal } from "@fidwastafid/schemas";
import { SITE_URL } from "../../../lib/siteUrl.js";

export function discountPct(deal: Deal): number | null {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

/** Réutilisée par generateMetadata (description) et les données structurées. */
export function dealDescription(deal: Deal): string {
  const pct = discountPct(deal);
  const remise = pct !== null ? ` (-${pct}%)` : "";
  const base = `${deal.titre} à ${deal.prixPromo} DH${remise} chez ${deal.enseigneSlug}.`;
  return deal.description ? `${base} ${deal.description}` : base;
}

/**
 * Product + Offer (schema.org) — CONTRAT-V1 §1 : un deal expiré reste 200
 * et affiché (jamais 404), donc les données structurées doivent rester
 * honnêtes avec ce que la page montre réellement, pas prétendre que
 * l'offre est encore active. `availability` reflète le statut réel ;
 * `priceValidUntil` n'est jamais renseigné sur une offre expirée (Google
 * pénalise les rich results trompeurs).
 */
export function dealJsonLd(deal: Deal, canonicalPath: string) {
  const expire = deal.statut === "expire";
  const url = new URL(canonicalPath, SITE_URL).toString();

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: deal.titre,
    description: dealDescription(deal),
    image: new URL("/opengraph-image", SITE_URL).toString(),
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "MAD",
      price: deal.prixPromo,
      availability: expire ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      ...(!expire && deal.dateFin ? { priceValidUntil: deal.dateFin } : {}),
    },
  };
}
