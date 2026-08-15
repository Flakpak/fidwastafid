/**
 * Source de scraping d'un deal, dérivée du DOMAINE de `deals.lien` — PAS une
 * colonne (option A retenue le 15/08/2026, docs/SPIKE-SOURCES.md) : zéro
 * migration, lecture seule, aucun risque sur le dédoublonnage
 * d'`insert-deals.mjs` (titre+enseigne_id+prix_promo, qui ne regarde jamais
 * `lien`). Motif : carrefour.ma et bringo.ma partagent délibérément la même
 * enseigne ("Carrefour", pour que le dédoublonnage s'applique entre les deux
 * — docs/SPIKE-SOURCES.md §12) mais restaient jusqu'ici indistinguables dans
 * la file admin, alors que leurs domaines de lien, eux, diffèrent toujours.
 *
 * Domaines vérifiés distincts le 14-15/08/2026 (grep sur tous les
 * apps/pipeline/scraper-*.mjs + vérification live des liens absolus pour
 * decathlon.ma et universparadiscount.ma) — aucune collision aujourd'hui.
 * Si une future source partage un domaine avec une existante, cette
 * dérivation cesse d'être fiable pour les deux : il faudrait alors une
 * vraie colonne `source` (option B, écartée pour l'instant faute de
 * collision réelle).
 */
export interface SourceAdmin {
  slug: string;
  domaine: string;
  label: string;
}

export const SOURCES_ADMIN: SourceAdmin[] = [
  { slug: "bringo", domaine: "bringo.ma", label: "Bringo" },
  { slug: "carrefour", domaine: "carrefour.ma", label: "Carrefour.ma (API)" },
  { slug: "ab-maroc", domaine: "ab-maroc.com", label: "AB Maroc" },
  { slug: "aswakassalam", domaine: "aswakassalam.com", label: "Aswak Assalam" },
  { slug: "kiabi", domaine: "kiabi.ma", label: "Kiabi" },
  { slug: "bestmark", domaine: "bestmark.ma", label: "Bestmark" },
  { slug: "decathlon", domaine: "decathlon.ma", label: "Decathlon" },
  { slug: "universparadiscount", domaine: "universparadiscount.ma", label: "Univers Paradiscount" },
];

/**
 * `lien` absent (inwi — pages détail client-rendered, jamais d'URL
 * inventée ; ou un catalogue PDF extrait à la main, `extract-catalogue.mjs`,
 * qui ne produit aucun `lien`) ou dont le domaine ne correspond à aucune
 * source connue — jamais exclu silencieusement de la file, montré comme
 * tel plutôt que de disparaître.
 */
export const SOURCE_INCONNUE_SLUG = "inconnue";

const SOURCES_PAR_SLUG = new Map(SOURCES_ADMIN.map((s) => [s.slug, s]));

export function sourceAdminParSlug(slug: string): SourceAdmin | undefined {
  return SOURCES_PAR_SLUG.get(slug);
}
