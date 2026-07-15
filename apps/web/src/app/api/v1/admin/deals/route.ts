import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { withAuthErrors } from "../../_lib/errors.js";
import { DEAL_ADMIN_SELECT, DEAL_FROM, toDealAdmin, type DealAdminRow } from "../../_lib/deals.js";

/**
 * Pas de pagination complète (curseur) — usage admin solo, CONTRAT-V1 §4
 * n'impose le curseur que sur l'API publique. Mais le pipeline peut
 * produire des centaines de deals par run (510 constatés le 15/07/2026 —
 * LIMIT 200 en masquait alors 310 silencieusement) : LIMIT généreux +
 * total réel (count(*) over()) pour que le client sache si des lignes
 * sont tronquées, au lieu d'une troncature silencieuse.
 */
const LIMIT = 1000;

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

  // count(*) over() : total réel des lignes qui matchent le WHERE, calculé
  // avant l'application du LIMIT — une seule requête, pas de second aller-
  // retour DB.
  const rows = await query<DealAdminRow & { total_count: number }>(
    `select ${DEAL_ADMIN_SELECT}, count(*) over()::int as total_count
     ${DEAL_FROM}
     ${where}
     order by (d.statut = 'auto_draft') desc, d.score desc, d.public_id desc
     limit $${limitIdx}`,
    values
  );

  const total = rows[0]?.total_count ?? 0;

  return NextResponse.json({ data: rows.map(toDealAdmin), total });
});
