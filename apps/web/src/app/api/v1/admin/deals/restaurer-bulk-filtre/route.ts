import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { query, withTransaction } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../_lib/errors.js";
import { DEAL_FROM } from "../../../_lib/deals.js";
import { lireFiltresAdmin, conditionsFiltresAdmin } from "../../../_lib/adminDealsFilters.js";
import { appliquerLotRestauration } from "../../../_lib/adminDealsRestaurerBulk.js";

export const runtime = "nodejs";

/**
 * POST /api/v1/admin/deals/restaurer-bulk-filtre — requireAdmin. Pendant
 * de `bulk-filtre` pour l'onglet Supprimés (lot du 15/08/2026, « tout
 * sélectionner », niveau 2) : FILTRE, jamais une liste de public_id — les
 * id sont résolus côté serveur, avec le MÊME prédicat que `GET
 * /admin/deals?supprime=true` (`conditionsFiltresAdmin`, source unique).
 * Un seul verbe possible (restaurer) : pas de corps JSON à lire, à la
 * différence de `bulk-filtre` qui doit choisir entre plusieurs statuts
 * cibles.
 *
 * Même plafond que `bulk-filtre` (2000) — même raison : un filtre qui
 * toucherait plus doit être affiné, jamais tronqué en silence.
 */
const MAX_LOT = 2000;

export const POST = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  const admin = await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const filtres = lireFiltresAdmin(searchParams);
  const values: unknown[] = [];
  const conditions = ["d.supprime_le is not null"];
  const { conditions: conditionsFiltres, values: valeursFiltres } = conditionsFiltresAdmin(filtres, values.length + 1);
  conditions.push(...conditionsFiltres);
  values.push(...valeursFiltres);

  values.push(MAX_LOT + 1);
  const limitIdx = values.length;
  const candidats = await query<{ public_id: string }>(
    `select d.public_id ${DEAL_FROM} where ${conditions.join(" and ")} order by d.public_id limit $${limitIdx}`,
    values
  );
  if (candidats.length > MAX_LOT) {
    return apiError(
      "VALIDATION_ERROR",
      `Ce filtre touche plus de ${MAX_LOT} lignes — affine-le avant de traiter le lot en une fois.`
    );
  }

  const lot = randomUUID();
  const publicIds = candidats.map((c) => c.public_id);
  const restaures = await withTransaction((client) => appliquerLotRestauration({ client, admin, publicIds, lot }));

  return NextResponse.json({ restaures, lot, touched: restaures.length });
});
