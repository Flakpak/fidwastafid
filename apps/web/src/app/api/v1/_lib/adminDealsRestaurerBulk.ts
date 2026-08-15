import type { PoolClient } from "@fidwastafid/db";
import type { AuthUser } from "@fidwastafid/auth";
import { logAudit } from "./audit.js";

export interface OptionsRestaurerLot {
  client: PoolClient;
  admin: AuthUser;
  publicIds: string[];
  /** Identifiant commun à toute exécution — même convention que
   *  `appliquerLotStatut` (lot du 12/08/2026), même si ce lot n'apparaît
   *  PAS dans « Lots récents » (celle-ci ne lit que `bulk_update_statut`,
   *  une transition de STATUT — la restauration n'en touche aucun,
   *  `supprime_le` n'est pas `deals.statut`. Défaire une restauration en
   *  masse reste, pour l'instant, un geste par ligne : re-supprimer). */
  lot: string;
}

/**
 * Efface `supprime_le` sur une liste de deals, dans une transaction déjà
 * ouverte — SOURCE UNIQUE avec `POST .../:publicId/restaurer` (même
 * requête, même trace d'audit), appelée deal par deal depuis
 * `restaurer-bulk` (sélection manuelle) et `restaurer-bulk-filtre` (filtre,
 * onglet Supprimés) — lot du 15/08/2026, « tout sélectionner ».
 *
 * Un `public_id` déjà restauré entre-temps (ou inconnu) est ignoré
 * silencieusement — même convention que `appliquerLotStatut` : pas un échec
 * du lot entier pour une entrée périmée.
 */
export async function appliquerLotRestauration({
  client,
  admin,
  publicIds,
  lot,
}: OptionsRestaurerLot): Promise<string[]> {
  const done: string[] = [];
  for (const publicId of publicIds) {
    const before = await client.query<{ id: string; statut: string; titre: string; supprime_le: string | null }>(
      "select id, statut, titre, supprime_le from deals where public_id = $1 for update",
      [publicId]
    );
    const deal = before.rows[0];
    if (!deal || !deal.supprime_le) continue;

    await client.query("update deals set supprime_le = null where id = $1", [deal.id]);

    await logAudit(
      {
        adminId: admin.id,
        action: "bulk_restaurer_deal",
        cibleType: "deal",
        cibleId: publicId,
        details: { titre: deal.titre, statutRestaure: deal.statut, lot },
      },
      client
    );
    done.push(publicId);
  }
  return done;
}
