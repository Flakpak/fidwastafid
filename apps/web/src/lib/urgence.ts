import type { Deal } from "@fidwastafid/schemas";

export type Urgence = { mode: "expiree" } | { mode: "compte-a-rebours" } | { mode: "lointaine" } | null;

/**
 * Classification stable (pas de tick) de l'urgence d'un deal selon sa
 * dateFin — partagée entre DealCard (feed) et la page deal, pour ne pas
 * dupliquer le calcul de date. Seul le mode "compte-a-rebours" a besoin
 * d'un composant client pour la valeur qui bouge (UrgenceCountdown).
 */
export function urgence(deal: Pick<Deal, "dateFin" | "statut">): Urgence {
  if (!deal.dateFin) return null;
  if (deal.statut === "expire") return { mode: "expiree" };
  const finMs = new Date(`${deal.dateFin}T23:59:59`).getTime() - Date.now();
  if (finMs <= 0) return { mode: "expiree" };
  if (finMs <= 48 * 3600 * 1000) return { mode: "compte-a-rebours" };
  return { mode: "lointaine" };
}
