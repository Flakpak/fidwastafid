import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { publicIdSchema } from "@fidwastafid/schemas";
import { withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { appliquerLotRestauration } from "../../../_lib/adminDealsRestaurerBulk.js";

export const runtime = "nodejs";

const restaurerBulkSchema = z.object({
  publicIds: z.array(publicIdSchema).min(1).max(100),
});

/**
 * POST /api/v1/admin/deals/restaurer-bulk — requireAdmin. Sélection
 * MANUELLE (cases à cocher, onglet Supprimés), bornée à 100 — même forme
 * que `POST /admin/deals/bulk`, appliquée à `appliquerLotRestauration`
 * plutôt qu'à `appliquerLotStatut` : lot du 15/08/2026, « tout
 * sélectionner ».
 */
export const POST = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  const admin = await requireAdmin(request);

  const parsed = await parseJsonBody(request, restaurerBulkSchema);
  if (!parsed.success) return parsed.response;

  const lot = randomUUID();
  const restaures = await withTransaction((client) =>
    appliquerLotRestauration({ client, admin, publicIds: parsed.data.publicIds, lot })
  );

  return NextResponse.json({ restaures, lot });
});
