import { query } from "@fidwastafid/db";

/** Résumé d'un lot — une ligne par `details.lot` distinct trouvé dans
 *  `journal_audit` (action `bulk_update_statut`). N'existe que pour les
 *  lots écrits APRÈS le lot du 12/08/2026 (`appliquerLotStatut`) — un
 *  `bulk_update_statut` antérieur n'a pas de `details.lot`, il n'apparaît
 *  donc jamais ici : rien à annuler pour lui, l'identifiant n'existe pas. */
export interface LotResume {
  lot: string;
  debuteLe: string;
  deals: number;
  verbe: string;
  motifRejet: string | null;
}

/**
 * Derniers lots d'action groupée — SOURCE : `journal_audit`, pas une table
 * dédiée (un lot n'est qu'un regroupement de lignes déjà écrites, jamais
 * une entité stockée séparément — une table de plus aurait pu diverger de
 * ce que `journal_audit` raconte réellement).
 */
export async function fetchLotsRecents(limite: number): Promise<LotResume[]> {
  const rows = await query<{
    lot: string;
    debute_le: string;
    deals: number;
    verbe: string;
    motif_rejet: string | null;
  }>(
    `select
       details->>'lot' as lot,
       min(created_at) as debute_le,
       count(*)::int as deals,
       (array_agg(details->>'apres' order by created_at))[1] as verbe,
       (array_agg(details->'motifRejet'->>'apres' order by created_at))[1] as motif_rejet
     from journal_audit
     where action = 'bulk_update_statut' and details ? 'lot'
     group by details->>'lot'
     order by min(created_at) desc
     limit $1`,
    [limite]
  );
  return rows.map((r) => ({
    lot: r.lot,
    debuteLe: new Date(r.debute_le).toISOString(),
    deals: r.deals,
    verbe: r.verbe,
    motifRejet: r.motif_rejet,
  }));
}

export interface EntreeLot {
  cibleId: string;
  avant: string;
  apres: string;
}

/** Chaque deal touché par un lot précis, avec son statut d'AVANT — c'est
 *  la donnée nécessaire pour défaire le lot (revenir à `avant`). */
export async function fetchEntreesLot(lot: string): Promise<EntreeLot[]> {
  const rows = await query<{ cible_id: string; avant: string; apres: string }>(
    `select cible_id, details->>'avant' as avant, details->>'apres' as apres
       from journal_audit
      where action = 'bulk_update_statut' and details->>'lot' = $1
      order by created_at`,
    [lot]
  );
  return rows.map((r) => ({ cibleId: r.cible_id, avant: r.avant, apres: r.apres }));
}
