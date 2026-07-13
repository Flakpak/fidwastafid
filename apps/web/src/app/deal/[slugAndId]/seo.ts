import type { Deal } from "@fidwastafid/schemas";

export function discountPct(deal: Deal): number | null {
  if (!deal.prixNormal || deal.prixNormal <= deal.prixPromo) return null;
  return Math.round((1 - deal.prixPromo / deal.prixNormal) * 100);
}

/** Réutilisée par generateMetadata (description) et les données structurées (Morceau 2). */
export function dealDescription(deal: Deal): string {
  const pct = discountPct(deal);
  const remise = pct !== null ? ` (-${pct}%)` : "";
  const base = `${deal.titre} à ${deal.prixPromo} DH${remise} chez ${deal.enseigneSlug}.`;
  return deal.description ? `${base} ${deal.description}` : base;
}
