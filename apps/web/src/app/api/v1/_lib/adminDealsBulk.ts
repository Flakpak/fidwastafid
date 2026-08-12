import type { PoolClient } from "@fidwastafid/db";
import type { DealStatut } from "@fidwastafid/schemas";
import type { AuthUser } from "@fidwastafid/auth";
import { logAudit } from "./audit.js";

export interface OptionsLotStatut {
  client: PoolClient;
  admin: AuthUser;
  publicIds: string[];
  statut: DealStatut;
  motifRejet?: string;
  /** Identifiant commun à TOUTE exécution de cette fonction — clé de
   *  l'annulation groupée symétrique (lot du 12/08/2026). */
  lot: string;
}

/**
 * Applique UNE transition de statut à une liste de deals, DANS une
 * transaction déjà ouverte par l'appelant — SOURCE UNIQUE du geste "lot",
 * partagée par :
 *   - `POST /admin/deals/bulk` (sélection manuelle, `publicIds` transmis
 *     par le client)
 *   - `POST /admin/deals/bulk-filtre` (filtre + verbe, ids résolus
 *     SERVEUR — jamais transmis par le client)
 * jamais deux copies de cette boucle : elle porte trois garanties qui
 * DOIVENT rester identiques des deux côtés — le motif obligatoire sur un
 * rejet (CONTRAT-V1 §3), la mémoire de curation (lot 2), et une entrée
 * `journal_audit` PAR DEAL (jamais une pour le lot entier).
 *
 * `lot` (lot filtres/tri, 12/08/2026) : posé dans `details.lot` de chaque
 * entrée d'audit — même mécanique que `recategoriser-autre.mjs`
 * (`RECATEGORISATION_LOT_ID`), c'est ce qui rend une annulation groupée
 * possible et symétrique, quel que soit le chemin qui a produit le lot.
 *
 * `supprime_le is null` ajouté au verrou (absent de l'ancien `bulk`, avant
 * ce lot) — défense en profondeur : la liste qui alimente une sélection
 * exclut déjà ces lignes, mais l'écriture ne doit pas en dépendre pour
 * rester correcte (même principe que le fail-closed de la diffusion,
 * dix-septième amendement).
 *
 * Un `public_id` disparu entre-temps (déjà traité par ailleurs, ou
 * supprimé) est ignoré silencieusement — pas un échec du lot entier pour
 * une entrée périmée.
 */
export async function appliquerLotStatut({
  client,
  admin,
  publicIds,
  statut,
  motifRejet,
  lot,
}: OptionsLotStatut): Promise<string[]> {
  const done: string[] = [];
  for (const publicId of publicIds) {
    const before = await client.query<{
      id: string;
      statut: string;
      motif_rejet: string | null;
      titre: string;
      lien: string | null;
      enseigne_id: string | null;
    }>(
      "select id, statut, motif_rejet, titre, lien, enseigne_id from deals where public_id = $1 and supprime_le is null for update",
      [publicId]
    );
    const deal = before.rows[0];
    if (!deal) continue;

    // `coalesce($2, motif_rejet)` : même convention que le PATCH unitaire —
    // un motif absent (statut non-rejet) laisse l'existant intact plutôt que
    // d'effacer l'historique d'un rejet précédent.
    await client.query(
      "update deals set statut = $1, motif_rejet = coalesce($2, motif_rejet), updated_at = now() where id = $3",
      [statut, motifRejet ?? null, deal.id]
    );

    // Mémoire de curation (lot 2) — même règle que le PATCH unitaire :
    // seulement sur une VRAIE transition vers rejete.
    if (deal.statut !== "rejete" && statut === "rejete") {
      const empreinteRow = await client.query<{ empreinte: string }>(
        `select empreinte_curation($1, $2, $3) as empreinte`,
        [deal.lien, deal.titre, deal.enseigne_id]
      );
      const empreinte = empreinteRow.rows[0]?.empreinte;
      if (!empreinte) throw new Error("empreinte_curation n'a renvoyé aucune ligne — ne devrait pas arriver.");
      await client.query(
        `insert into memoire_curation (empreinte, decision, deal_origine_public_id, motif, decide_par)
         values ($1, 'rejete', $2, $3, $4)`,
        [empreinte, publicId, motifRejet ?? deal.motif_rejet, admin.id]
      );
    }

    await logAudit(
      {
        adminId: admin.id,
        action: "bulk_update_statut",
        cibleType: "deal",
        cibleId: publicId,
        details: {
          avant: deal.statut,
          apres: statut,
          lot,
          // Consigné seulement quand il change réellement quelque chose —
          // un journal ne rapporte pas de modification inexistante
          // (cf. _lib/auditDiff.ts, même règle sur le PATCH unitaire).
          ...(motifRejet && motifRejet !== deal.motif_rejet
            ? { motifRejet: { avant: deal.motif_rejet, apres: motifRejet } }
            : {}),
        },
      },
      client
    );

    done.push(publicId);
  }
  return done;
}
