/**
 * Slug cosmétique dérivé d'un titre — CONTRAT-V1 §1 : ASCII, minuscules,
 * tirets, ~60 caractères max. Jamais stocké en base, recalculé à la volée
 * à chaque rendu — le serveur résout toujours sur le public_id (dernier
 * segment après le dernier tiret), jamais sur le slug lui-même.
 *
 * Partagé (pas réimplémenté localement) : le feed/la page deal en ont besoin
 * pour construire les URLs, le sitemap (Phase 5) et le mobile (Phase 8) en
 * auront besoin de la même dérivation, pour rester identique partout.
 */
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function slugify(titre: string): string {
  return titre
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/**
 * Segment d'URL complet `[slug]-[public_id]` — CONTRAT-V1 §1. Si le titre
 * ne produit aucun caractère ASCII (ex. titre entièrement en arabe), repli
 * sur le public_id seul plutôt qu'un tiret orphelin en tête.
 */
export function dealUrlSlug(titre: string, publicId: string): string {
  const slug = slugify(titre);
  return slug ? `${slug}-${publicId}` : publicId;
}
