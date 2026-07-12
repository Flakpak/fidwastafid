import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { publicIdSchema } from "@fidwastafid/schemas";
import { apiError } from "../../_lib/errors.js";
import { DEAL_SELECT, DEAL_FROM, PUBLIC_STATUTS, toDeal, type DealRow } from "../../_lib/deals.js";

/**
 * GET /api/v1/deals/:publicId — public, sans auth. Un deal expiré reste 200
 * (jamais 404/410 — CONTRAT-V1 §1, c'est un actif SEO). en_attente/rejete/
 * auto_draft ne sont pas exposés ici : NOT_FOUND, comme s'ils n'existaient
 * pas pour un visiteur non authentifié.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> }
): Promise<NextResponse> {
  const { publicId } = await params;

  if (!publicIdSchema.safeParse(publicId).success) {
    return apiError("NOT_FOUND", "Deal introuvable.");
  }

  const statuts = Array.from(PUBLIC_STATUTS);
  const rows = await query<DealRow>(
    `select ${DEAL_SELECT} ${DEAL_FROM} where d.public_id = $1 and d.statut = any($2)`,
    [publicId, statuts]
  );

  const row = rows[0];
  if (!row) return apiError("NOT_FOUND", "Deal introuvable.");

  return NextResponse.json(toDeal(row));
}
