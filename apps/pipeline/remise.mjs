// ============================================================
// FIDWASTAFID — Seuil de remise minimum (règle éditoriale partagée)
//
// FAIT GÉNÉRATEUR (02/08/2026) : audit des quatre scrapers en production
// (bringo, inwi, universparadiscount, decathlon). AUCUN n'appliquait de
// seuil de remise. La seule règle de prix appliquée jusqu'ici était la
// COHÉRENCE (`prix_normal >= prix_promo`) et la PRÉSENCE des deux prix —
// jamais l'AMPLEUR de la remise. Un produit à -2 % entrait dans la file
// exactement comme un produit à -70 %.
//
// Ce n'était donc pas un défaut d'une source, mais un manque générique :
// le pipeline savait dire « c'est bien une promotion », jamais « c'est bien
// une bonne affaire ». Un site qui s'appelle « les bons plans du Maroc » ne
// peut pas laisser cette question sans réponse écrite.
//
// OÙ CETTE RÈGLE S'APPLIQUE : dans insert-deals.mjs, c'est-à-dire au SEUL
// point de passage commun à toutes les sources (scrapers ET catalogues
// extraits). La poser dans chaque scraper aurait produit six copies qui
// divergent — même raison que la validation zod partagée (validation.mjs).
//
// C'EST UN CADRAN ÉDITORIAL, PAS UNE CONSTANTE TECHNIQUE. Le changer change
// ce que le site montre. Effet mesuré du passage à 30 % sur les extractions
// réelles du 02/08/2026 :
//
//   source                total   ≥30 %   médiane
//   kiabi                   120     110     50 %
//   decathlon               118      66     30 %
//   universparadiscount      80      57     33 %
//   inwi                      6       3     34 %
//   bestmark                  1       0     16 %
//
// Autrement dit : à 30 %, Decathlon perd ~44 % de son volume et Bestmark
// tombe à zéro. C'est une décision de ligne éditoriale assumée, pas un
// effet de bord — elle se relit ici avant d'être modifiée.
// ============================================================

/** Remise minimale, en pourcentage, pour qu'un deal entre en file. */
export const SEUIL_REMISE_MIN_PCT = 30;

/**
 * Pourcentage de remise, ou null si non mesurable (prix normal absent ou
 * nul). `null` signifie « on ne sait pas », jamais « zéro » — la distinction
 * porte la décision de estRemiseSuffisante() ci-dessous.
 */
export function pourcentageRemise(prixPromo, prixNormal) {
  const promo = Number(prixPromo);
  const normal = Number(prixNormal);
  if (!Number.isFinite(promo) || !Number.isFinite(normal) || normal <= 0) return null;
  return (1 - promo / normal) * 100;
}

/**
 * Décide si un deal passe le seuil.
 *
 * Retourne { ok, pct, mesurable } plutôt qu'un booléen : l'appelant doit
 * pouvoir distinguer « remise trop faible » (rejet net) de « remise non
 * mesurable » (prix normal absent). Ce second cas EXISTE en production —
 * scraper-bringo produit des deals dont `discount > 0` mais dont le prix
 * barré n'est pas exposé.
 *
 * Choix explicite : un deal non mesurable PASSE. Le rejeter reviendrait à
 * lui prêter une remise faible qu'on n'a pas constatée, exactement le
 * « prix deviné » que le CONTRAT interdit — en négatif. Il est compté et
 * journalisé à part par l'appelant, pour que ce trou reste visible plutôt
 * que de se fondre dans les compteurs.
 */
export function estRemiseSuffisante(prixPromo, prixNormal, seuil = SEUIL_REMISE_MIN_PCT) {
  const pct = pourcentageRemise(prixPromo, prixNormal);
  if (pct === null) return { ok: true, pct: null, mesurable: false };
  // Tolérance de comparaison, et elle n'est pas cosmétique : un rabais de
  // 70 → 100, mathématiquement 30 %, se calcule en flottant à
  // 30.000000000000004 — et l'écart peut tomber du mauvais côté selon les
  // valeurs. Sans cette marge, un deal pile au seuil serait accepté ou
  // rejeté selon les décimales de son prix, ce qui est indéfendable devant
  // un curateur. 1e-9 est très en dessous de toute remise réelle.
  return { ok: pct >= seuil - 1e-9, pct, mesurable: true };
}
