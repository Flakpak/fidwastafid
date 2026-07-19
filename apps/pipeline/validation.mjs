// ============================================================
// FIDWASTAFID — Validation partagée avant insertion (Phase 7A)
//
// Source de vérité unique : packages/schemas (dealInputSchema, les mêmes
// règles que POST /api/v1/deals côté API). Remplace l'ancienne validation
// locale d'insert-deals.mjs (présence manuelle de titre/prix_promo/
// prix_normal, liste CATEGORIES_VALIDES recopiée à la main) — un deal qui
// ne satisfait plus ces règles est rejeté, jamais inséré avec une valeur
// devinée (ex. catégorie repliée sur "Autre" faute de correspondance).
//
// Ne lève jamais : { ok: true } ou { ok: false, message }, à l'appelant de
// journaliser et sauter le deal (le rejet prime sur l'invention).
// ============================================================

import { dealInputSchema } from "@fidwastafid/schemas";

/**
 * Construit l'objet de validation (forme camelCase de POST /api/v1/deals)
 * depuis un deal déjà mappé au schéma table `deals` (snake_case, forme
 * produite par mapDeal() dans insert-deals.mjs). `null` -> `undefined` pour
 * les champs optionnels : dealInputSchema utilise `.optional()` (pas
 * `.nullable()`), un `null` explicite échouerait le typage zod.
 */
function toValidationCandidate(d) {
  return {
    titre: d.titre,
    ville: d.ville,
    categorie: d.categorie,
    type: d.type,
    prixPromo: d.prix_promo,
    prixNormal: d.prix_normal ?? undefined,
    dateFin: d.date_fin ?? undefined,
    description: d.description ?? undefined,
    lien: d.lien ?? undefined,
    whatsappPublic: false,
  };
}

/**
 * Valide un deal mappé contre le schéma partagé. Ne concerne que la forme
 * métier du deal (titre, prix, catégorie, type, cohérence physique/en_ligne)
 * — la résolution enseigne_id (table `enseignes`) reste un contrôle
 * distinct, propre à insert-deals.mjs, effectué séparément.
 */
export function validateDeal(d) {
  const result = dealInputSchema.safeParse(toValidationCandidate(d));
  if (result.success) return { ok: true };
  const message = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | ");
  return { ok: false, message };
}
