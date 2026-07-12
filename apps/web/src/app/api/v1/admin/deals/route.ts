import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { withAuthErrors } from "../../_lib/errors.js";
import { DEAL_ADMIN_SELECT, DEAL_FROM, toDealAdmin, type DealAdminRow } from "../../_lib/deals.js";

/** Pas de volume qui justifie une vraie pagination pour un pipeline admin. */
const LIMIT = 200;

/**
 * GET /api/v1/admin/deals — requireAdmin. Pipeline complet (tous statuts,
 * pas de filtre par défaut), auto_draft toujours en tête (CONTRAT-V1 §4),
 * puis score décroissant. Inclut whatsappContact — jamais exposé ailleurs.
 */
export const GET = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const statutFilter = searchParams.get("statut");

  const conditions: string[] = [];
  const values: unknown[] = [];
  if (statutFilter) {
    values.push(statutFilter);
    conditions.push(`d.statut = $${values.length}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  values.push(LIMIT);
  const limitIdx = values.length;

  const rows = await query<DealAdminRow>(
    `select ${DEAL_ADMIN_SELECT}
     ${DEAL_FROM}
     ${where}
     order by (d.statut = 'auto_draft') desc, d.score desc, d.public_id desc
     limit $${limitIdx}`,
    values
  );

  return NextResponse.json({ data: rows.map(toDealAdmin) });
});
