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
 */
const bulkUpdateSchema = z.object({
  publicIds: z.array(publicIdSchema).min(1).max(100),
  statut: dealStatutSchema,
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
  const { publicIds, statut } = parsed.data;

  const updated = await withTransaction(async (client) => {
    const done: string[] = [];
    for (const publicId of publicIds) {
      const before = await client.query<{ id: string; statut: string }>(
        "select id, statut from deals where public_id = $1 for update",
        [publicId]
      );
      const deal = before.rows[0];
      if (!deal) continue;

      await client.query("update deals set statut = $1, updated_at = now() where id = $2", [statut, deal.id]);

      await logAudit(
        {
          adminId: admin.id,
          action: "bulk_update_statut",
          cibleType: "deal",
          cibleId: publicId,
          details: { avant: deal.statut, apres: statut },
        },
        client
      );

      done.push(publicId);
    }
    return done;
  });

  return NextResponse.json({ updated });
});
