import type { DealStatut } from "@fidwastafid/schemas";

/**
 * Actions de modération valides PAR STATUT COURANT — source UNIQUE, partagée
 * entre le rendu client (boutons par ligne et actions groupées,
 * `AdminPipeline.tsx`) et la validation serveur (`bulk-filtre/route.ts`,
 * lot du 15/08/2026 « tout sélectionner ») : une action qui n'a pas de sens
 * sur un statut donné (ex. "expirer" un `rejete`) ne doit jamais pouvoir
 * être demandée, ni affichée ni acceptée — deux copies de cette liste
 * auraient fini par diverger, exactement le motif déjà cité pour
 * `conditionsFiltresAdmin` et la validation zod du pipeline.
 */
export interface ActionOnglet {
  label: string;
  statut: DealStatut;
  variant: "primaire" | "danger" | "neutre";
}

export const ONGLET_ACTIONS: Record<DealStatut, ActionOnglet[]> = {
  auto_draft: [
    { label: "Valider", statut: "publie", variant: "primaire" },
    { label: "Rejeter", statut: "rejete", variant: "danger" },
  ],
  en_attente: [
    { label: "Valider", statut: "publie", variant: "primaire" },
    { label: "Rejeter", statut: "rejete", variant: "danger" },
  ],
  publie: [
    { label: "Expirer", statut: "expire", variant: "neutre" },
    { label: "Retirer", statut: "rejete", variant: "danger" },
  ],
  rejete: [
    { label: "Republier", statut: "publie", variant: "primaire" },
    { label: "Remettre en attente", statut: "en_attente", variant: "neutre" },
  ],
  expire: [{ label: "Republier", statut: "publie", variant: "primaire" }],
};

/** Ensemble des statuts cibles valides pour une action groupée PARTANT de
 *  `onglet` — c'est CETTE fonction, pas une liste à plat, que
 *  `bulk-filtre/route.ts` interroge : un `verbe` hors de cet ensemble est
 *  un `VALIDATION_ERROR`, jamais une transition silencieusement acceptée. */
export function verbesAutorises(onglet: DealStatut): Set<DealStatut> {
  return new Set(ONGLET_ACTIONS[onglet].map((a) => a.statut));
}
