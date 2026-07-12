import { NextResponse } from "next/server";
import { withTransaction } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { dealStatutUpdateSchema } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { DEAL_ADMIN_SELECT, DEAL_FROM, toDealAdmin, type DealAdminRow } from "../../../_lib/deals.js";
import { logAudit } from "../../../_lib/audit.js";

type Context = { params: Promise<{ publicId: string }> };

/**
 * PATCH /api/v1/admin/deals/:publicId — requireAdmin. Changement de statut,
 * tracé dans journal_audit dans la même transaction (pas d'action admin
 * sans sa trace).
 */
export const PATCH = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { publicId } = await params;

  const parsed = await parseJsonBody(request, dealStatutUpdateSchema);
  if (!parsed.success) return parsed.response;
  const { statut } = parsed.data;

  const result = await withTransaction(async (client) => {
    const before = await client.query<{ id: string; statut: string }>(
      "select id, statut from deals where public_id = $1 for update",
      [publicId]
    );
    const deal = before.rows[0];
    if (!deal) return null;

    await client.query("update deals set statut = $1, updated_at = now() where id = $2", [statut, deal.id]);

    await logAudit(
      {
        adminId: admin.id,
        action: "update_statut",
        cibleType: "deal",
        cibleId: publicId,
        details: { avant: deal.statut, apres: statut },
      },
      client
    );

    const updated = await client.query<DealAdminRow>(`select ${DEAL_ADMIN_SELECT} ${DEAL_FROM} where d.id = $1`, [
      deal.id,
    ]);
    return updated.rows[0] ?? null;
  });

  if (!result) return apiError("NOT_FOUND", "Deal introuvable.");
  return NextResponse.json(toDealAdmin(result));
});
