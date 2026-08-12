import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { publicIdSchema, dealStatutSchema } from "@fidwastafid/schemas";
import { withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { appliquerLotStatut } from "../../../_lib/adminDealsBulk.js";

/**
 * Forme non fixée par CONTRAT-V1 (qui ne dit que "actions groupées") —
 * un statut appliqué à un lot de public_id, borné à 100 par appel.
 * Sélection MANUELLE (cases à cocher) — voir `bulk-filtre` pour l'action
 * « tout le résultat filtré », qui ne transmet jamais de liste d'id.
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
 *
 * `lot` (lot filtres/tri, 12/08/2026) — identifiant généré ici, posé sur
 * chaque entrée d'audit du lot (`appliquerLotStatut`, `_lib/
 * adminDealsBulk.ts`) : clé de l'annulation groupée symétrique, que la
 * sélection ait été manuelle (ici) ou par filtre (`bulk-filtre`).
 */
export const POST = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  const admin = await requireAdmin(request);

  const parsed = await parseJsonBody(request, bulkUpdateSchema);
  if (!parsed.success) return parsed.response;
  const { publicIds, statut, motifRejet } = parsed.data;

  const lot = randomUUID();
  const updated = await withTransaction((client) =>
    appliquerLotStatut({ client, admin, publicIds, statut, motifRejet, lot })
  );

  return NextResponse.json({ updated, lot });
});
