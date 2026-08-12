import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { publicIdSchema, dealStatutSchema } from "@fidwastafid/schemas";
import { withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { logAudit } from "../../../_lib/audit.js";

/**
 * Forme non fixée par CONTRAT-V1 (qui ne dit que "actions groupées") —
 * un statut appliqué à un lot de public_id, borné à 100 par appel.
 *
 * `motifRejet` ajouté le 27/07/2026 : sans lui, cet endpoint était un
 * contournement complet de l'obligation de motiver un rejet (CONTRAT-V1 §3).
 * Une garantie serveur qui tient sur un seul des deux chemins d'écriture n'est
 * pas une garantie. Le motif est ici commun au lot — c'est le cas d'usage réel
 * (rejeter d'un coup vingt `auto_draft` pour la même raison).
 */
const bulkUpdateSchema = z
  .object({
    publicIds: z.array(publicIdSchema).min(1).max(100),
    statut: dealStatutSchema,
    motifRejet: z.string().trim().min(3).max(500).optional(),
  })
  .superRefine((val, ctx) => {
    // Contrairement au PATCH unitaire, la règle est vérifiable ici sans lire la
    // base : une action groupée est toujours une TRANSITION voulue vers le
    // statut demandé, jamais l'édition d'un deal déjà dans cet état.
    if (val.statut === "rejete" && !val.motifRejet) {
      ctx.addIssue({
        code: "custom",
        path: ["motifRejet"],
        message: "Un rejet doit être motivé : le soumetteur doit pouvoir comprendre pourquoi.",
      });
    }
  });

/**
 * POST /api/v1/admin/deals/bulk — requireAdmin. Les public_id inconnus sont
 * ignorés silencieusement (pas d'échec du lot entier pour une entrée
 * périmée) ; `updated` liste ceux réellement modifiés pour que l'admin
 * puisse réconcilier côté UI.
 */
export const POST = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  const admin = await requireAdmin(request);

  const parsed = await parseJsonBody(request, bulkUpdateSchema);
  if (!parsed.success) return parsed.response;
  const { publicIds, statut, motifRejet } = parsed.data;

  const updated = await withTransaction(async (client) => {
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
        "select id, statut, motif_rejet, titre, lien, enseigne_id from deals where public_id = $1 for update",
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
      // seulement sur une VRAIE transition vers rejete. bulk n'édite jamais
      // titre/lien/enseigne, l'empreinte se calcule donc directement sur
      // les valeurs existantes de la ligne (jamais le prix).
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
  });

  return NextResponse.json({ updated });
});
