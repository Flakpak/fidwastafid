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

/* `jaugeRemplissage` a été retirée au lot 6 avec la jauge elle-même : le score
   en graisse 700 porte désormais seul le niveau. Ne pas la réintroduire sans
   réintroduire la jauge — une fonction sans appelant est de la dette. */
