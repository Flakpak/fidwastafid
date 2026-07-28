/**
 * Identifiants publics du seed de dev — module SANS effet de bord, pour que
 * `verify.ts` (test hors ligne, `pnpm test`) puisse les valider sans exécuter
 * le seed, qui ouvre une connexion et écrit en base.
 *
 * Même motif que apps/web/tests/fixtures.ts (28/07/2026) : un public_id écrit
 * à la main qui sort de PUBLIC_ID_ALPHABET n'échoue qu'au moment de l'`insert`,
 * sur `deals_public_id_check` / `users_public_id_check` — donc seulement chez
 * qui exécute le seed, et jamais en CI. Ces valeurs sont désormais vérifiées
 * là où ça ne coûte ni base ni secret.
 */
export const SEED_PUBLIC_IDS = {
  admin: "kdm2p9qa23",
  huileLesieur: "d3m2p9qa23",
  ecouteurs: "d3m2p9qa24",
  couchesBebe: "d3m2p9qa25",
} as const;
