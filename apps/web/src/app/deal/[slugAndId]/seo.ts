import type { Deal } from "@fidwastafid/schemas";
import { SITE_URL } from "../../../lib/siteUrl.js";

export function discountPct(deal: Pick<Deal, "prixPromo" | "prixNormal">): number | null {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

/** Réutilisée par generateMetadata (description) et les données structurées. */
export function dealDescription(deal: Deal): string {
  const pct = discountPct(deal);
  const remise = pct !== null ? ` (-${pct}%)` : "";
  const chez = deal.enseigneSlug ? ` chez ${deal.enseigneSlug}` : "";
  const base = `${deal.titre} à ${deal.prixPromo} DH${remise}${chez}.`;
  return deal.description ? `${base} ${deal.description}` : base;
}

/** Nom d'enseigne lisible pour l'affichage (même repli que la carte deal :
 *  enseigne curée d'abord, sinon nom de vendeur en texte libre). */
function enseigneLabel(deal: Pick<Deal, "enseigneNom" | "nomVendeur">): string | undefined {
  return deal.enseigneNom ?? deal.nomVendeur;
}

/**
 * og:description dédiée — incident du 20/07/2026 (capture de partage
 * WhatsApp analysée) : `dealDescription()` (titre + prix + DÉBUT de la
 * description produit brute, tronqué par WhatsApp) faisait doublon avec
 * og:title (déjà le titre) et donnait un aperçu illisible. Toujours une
 * seule ligne, jamais le titre, jamais la description produit — seulement
 * le prix (obligatoire, cf. dealSchema) et, quand ils existent, la remise
 * et l'enseigne.
 *
 * `discountPct` ne peut être non-null que si `prixNormal` existe (dérivé de
 * lui) : "remise sans prix barré" n'est pas un cas atteignable avec le
 * schéma actuel. Le repli "Bon plan chez {enseigne}" (sans prix) vient tel
 * quel de la demande ; le dernier repli ("{prix} DH" seul, ni remise ni
 * enseigne) est un ajout pour ne jamais renvoyer une chaîne vide.
 */
export function dealOgDescription(deal: Pick<Deal, "prixPromo" | "prixNormal" | "enseigneNom" | "nomVendeur">): string {
  const pct = discountPct(deal);
  const enseigne = enseigneLabel(deal);

  if (deal.prixNormal && pct !== null) {
    const base = `${deal.prixPromo} DH au lieu de ${deal.prixNormal} DH (-${pct}%)`;
    return enseigne ? `${base} · ${enseigne}` : base;
  }

  if (enseigne) return `Bon plan chez ${enseigne}`;

  return `${deal.prixPromo} DH`;
}

/**
 * og:title — titre seul, tronqué proprement sur un espace (jamais en plein
 * mot) à ~70 caractères : au-delà, WhatsApp/Facebook tronquent eux-mêmes de
 * façon moins soignée (coupe en plein mot, parfois en plein caractère
 * multi-octets). `minCut` évite une coupe absurdement courte si le premier
 * espace utile tombe très tôt dans la chaîne.
 */
export function truncateOgTitle(titre: string, max = 70, minCut = 20): string {
  if (titre.length <= max) return titre;
  const cut = titre.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const clean = lastSpace >= minCut ? cut.slice(0, lastSpace) : cut;
  return `${clean.trimEnd()}…`;
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
