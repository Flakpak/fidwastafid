import { NextResponse } from "next/server";
import { requireAdmin } from "@fidwastafid/auth";
import { withAuthErrors } from "../../../_lib/errors.js";
import { fetchLotsRecents } from "../../../_lib/adminDealsLots.js";

export const runtime = "nodejs";

const LIMITE = 30;

/**
 * GET /api/v1/admin/deals/lots — requireAdmin. Derniers lots d'action
 * groupée (`bulk`, `bulk-filtre` — lot du 12/08/2026), pour l'écran
 * « Lots récents » : retrouver un lot et le défaire
 * (`POST .../lots/:lot/annuler`).
 */
export const GET = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  await requireAdmin(request);
  const lots = await fetchLotsRecents(LIMITE);
  return NextResponse.json({ data: lots });
});
