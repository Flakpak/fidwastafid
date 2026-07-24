/**
 * Seuil « deal chaud » — repris tel quel de la logique existante : la carte
 * marquait déjà `deal.score >= 20` comme « Tendance ». Centralisé ici pour que
 * DealCard (liseré gauche + badge « Tendance ») et CardVote (teinte du score +
 * jauge) partagent la même frontière sans dérive. Ce n'est pas une nouvelle
 * règle métier : la même valeur, à un seul endroit.
 */
export const SEUIL_CHAUD = 20;

export type Temperature = "chaud" | "neutre" | "froid";

/** Zone de température d'un score : chaud ≥ seuil, froid < 0, neutre entre. */
export function temperature(score: number): Temperature {
  if (score >= SEUIL_CHAUD) return "chaud";
  if (score < 0) return "froid";
  return "neutre";
}

/**
 * Remplissage de la jauge de température, en pourcentage (0–100). Proportionnel
 * au score, plafonné à 3× le seuil chaud (= jauge pleine) — le plafond dérive
 * du seuil, il n'est pas choisi indépendamment. Plancher à 4 % pour qu'un score
 * nul ou négatif reste un filet visible plutôt qu'une jauge vide.
 */
export function jaugeRemplissage(score: number): number {
  const plein = SEUIL_CHAUD * 3;
  return Math.max(4, Math.min(100, Math.round((score / plein) * 100)));
}
