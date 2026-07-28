/**
 * Identifiants publics des fixtures d'intégration — module SANS effet de bord,
 * pour que le test hors ligne (tests/unit.ts) puisse les valider sans exécuter
 * la suite d'intégration, qui exige une base et un JWT.
 *
 * Fait générateur (28/07/2026, PR #59) : quatre fixtures ajoutées à la main
 * portaient le chiffre `1`, absent de PUBLIC_ID_ALPHABET (pas de 0/1/l/o —
 * anti-confusion, CONTRAT-V1 §1). Les `insert` échouaient sur
 * `deals_public_id_check`, quatre fois d'affilée, et UNIQUEMENT dans le job
 * `integration` — non bloquant parce que dependabot n'a pas les secrets, pas
 * pour laisser passer une régression. La faute tombe désormais dans `quality`.
 *
 * Pourquoi des littéraux figés et non `generatePublicId()` : ces identifiants
 * sont les CLÉS D'UPSERT des fixtures (`on conflict (public_id) do update`).
 * Tirés au hasard à chaque exécution, ils ne rencontreraient jamais de
 * conflit — chaque run ajouterait un jeu de deals à la base d'intégration, qui
 * est le projet Supabase réel. Le déterminisme n'est pas un confort ici, c'est
 * ce qui borne la table. Ils sont donc figés, lisibles (le préfixe dit à quoi
 * sert la ligne), et vérifiés par construction.
 */

/** Deals et utilisateurs réellement insérés par tests/integration.ts. */
export const PUBLIC_IDS_FIXTURES = {
  utilisateurTest: "itg2p9qa23",
  utilisateurAutre: "aut2p9qa23",
  dealPrincipal: "itgd2a9qa2",
  /** Les quatre situations de localisation (lot 7) : en ligne sans ville,
   *  national, et deux villes distinctes. */
  dealEnLigne: "itgenpqa2a",
  dealNational: "itgnatpqa2",
  dealCasablanca: "itgcaspqa2",
  dealRabat: "itgrabpqa2",
} as const;

/**
 * Identifiant de FORME VALIDE mais volontairement absent de la base — les
 * tests 404 doivent éprouver l'absence, pas le rejet de forme. S'il cessait
 * d'être conforme à l'alphabet, ces tests passeraient pour la mauvaise raison.
 */
export const PUBLIC_ID_INEXISTANT = "zzzzzzzzzz";

export const TOUS_LES_PUBLIC_IDS: readonly string[] = [
  ...Object.values(PUBLIC_IDS_FIXTURES),
  PUBLIC_ID_INEXISTANT,
];
