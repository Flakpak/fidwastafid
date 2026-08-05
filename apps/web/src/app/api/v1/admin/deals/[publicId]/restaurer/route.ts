import { NextResponse } from "next/server";
import { withTransaction } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../../_lib/errors.js";
import { DEAL_ADMIN_SELECT, DEAL_FROM, toDealAdmin, type DealAdminRow } from "../../../../_lib/deals.js";
import { logAudit } from "../../../../_lib/audit.js";

type Context = { params: Promise<{ publicId: string }> };

/**
 * POST /api/v1/admin/deals/:publicId/restaurer — requireAdmin. Efface
 * `supprime_le` (lot 1) — l'inverse exact du DELETE. `statut` n'ayant
 * jamais été touché par la suppression, le deal revient dans son statut
 * D'ORIGINE (`auto_draft`, `en_attente`, `publie`, `rejete` ou `expire`),
 * jamais un statut par défaut : la restauration n'a rien à deviner, la
 * colonne n'a jamais menti.
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { publicId } = await params;

  const result = await withTransaction(async (client) => {
    const before = await client.query<{ id: string; statut: string; titre: string; supprime_le: string | null }>(
      "select id, statut, titre, supprime_le from deals where public_id = $1 for update",
      [publicId]
    );
    const deal = before.rows[0];
    if (!deal) return { kind: "not_found" as const };
    if (!deal.supprime_le) return { kind: "not_deleted" as const };

    await client.query("update deals set supprime_le = null where id = $1", [deal.id]);

    await logAudit(
      {
        adminId: admin.id,
        action: "restaurer_deal",
        cibleType: "deal",
        cibleId: publicId,
        details: { titre: deal.titre, statutRestaure: deal.statut },
      },
      client
    );

    const updated = await client.query<DealAdminRow>(`select ${DEAL_ADMIN_SELECT} ${DEAL_FROM} where d.id = $1`, [
      deal.id,
    ]);
    return { kind: "ok" as const, row: updated.rows[0] };
  });

  if (result.kind === "not_found") return apiError("NOT_FOUND", "Deal introuvable.");
  if (result.kind === "not_deleted") return apiError("CONFLICT", "Ce deal n'est pas supprimé.");
  if (!result.row) return apiError("NOT_FOUND", "Deal introuvable.");
  return NextResponse.json(toDealAdmin(result.row));
});
