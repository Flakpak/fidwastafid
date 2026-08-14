// Helpers partagés par les scrapers WooCommerce Store API (ab-maroc.mjs,
// aswakassalam.mjs — même famille d'API publique, découverte le 14/08/2026,
// docs/SPIKE-SOURCES.md §9). Une seule copie, comme categoriser.mjs.

/**
 * `prices.sale_price`/`regular_price` de la Store API sont des chaînes en
 * sous-unité (centimes), avec `prices.currency_minor_unit` indiquant le
 * nombre de décimales (2 = centimes, vérifié le 14/08/2026 sur les deux
 * sites). "54900" + minorUnit=2 → 549.00 DH. Retourne null si non numérique
 * — jamais de prix deviné.
 */
export function prixDepuisCentimes(valeur, minorUnit) {
  const n = Number(valeur);
  const decimales = Number(minorUnit);
  if (!Number.isFinite(n) || !Number.isFinite(decimales)) return null;
  return n / 10 ** decimales;
}

/**
 * `date_on_sale_to` de la Store API : ISO 8601, avec ou sans suffixe `Z`
 * selon le site (non uniforme, vérifié). On ne garde que le jour calendaire
 * (même convention que scraper-carrefour.mjs) ; null si absent/invalide —
 * repli JAMAIS silencieux, l'appelant compte les occurrences.
 */
export function dateFinDepuisISO(iso) {
  if (!iso || typeof iso !== "string") return null;
  const jour = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : null;
}
