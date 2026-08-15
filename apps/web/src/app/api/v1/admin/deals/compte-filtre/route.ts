import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { dealStatutSchema } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../../_lib/errors.js";
import { DEAL_FROM } from "../../../_lib/deals.js";
import { lireFiltresAdmin, conditionsFiltresAdmin } from "../../../_lib/adminDealsFilters.js";

export const runtime = "nodejs";

/**
 * GET /api/v1/admin/deals/compte-filtre — requireAdmin. `count(*)` pour
 * un (statut + filtres) EXACT, jamais déduit de la longueur d'une page
 * chargée — même discipline que `GET /admin/deals/compte` (neuvième
 * amendement conscient), étendue au cas où un FILTRE, pas seulement un
 * statut, borne le résultat.
 *
 * SOURCE UNIQUE avec la liste (`GET /admin/deals`) et l'action groupée
 * (`POST /admin/deals/bulk-filtre`) : les trois appellent
 * `conditionsFiltresAdmin` — un compteur qui compte autrement que le
 * filtre est un bug (même principe que `GET /deals/compte` côté public,
 * septième amendement conscient).
 *
 * `?supprime=true` (lot du 15/08/2026, « tout sélectionner ») — même
 * bascule exclusive que `GET /admin/deals`, pour l'onglet Supprimés
 * (`restaurer-bulk-filtre`) : compte `supprime_le is not null` au lieu
 * d'un `statut`, mêmes filtres combinables.
 *
 * Rôle : donner à la confirmation d'une action groupée par filtre le
 * nombre EXACT de lignes qu'elle va toucher, avant tout envoi — la
 * personne doit lire ce qu'elle s'apprête à faire, pas seulement combien
 * (voir `bulk-filtre/route.ts`).
 */
export const GET = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const modeSupprime = searchParams.get("supprime") === "true";

  const values: unknown[] = [];
  const conditions: string[] = [];
  if (modeSupprime) {
    conditions.push("d.supprime_le is not null");
  } else {
    const statutParsed = dealStatutSchema.safeParse(searchParams.get("statut"));
    if (!statutParsed.success) {
      return apiError("VALIDATION_ERROR", "Paramètre statut requis, parmi les statuts connus.");
    }
    values.push(statutParsed.data);
    conditions.push("d.statut = $1", "d.supprime_le is null");
  }

  const filtres = lireFiltresAdmin(searchParams);
  const { conditions: conditionsFiltres, values: valeursFiltres } = conditionsFiltresAdmin(filtres, values.length + 1);
  conditions.push(...conditionsFiltres);
  values.push(...valeursFiltres);

  const rows = await query<{ total: number }>(
    `select count(*)::int as total ${DEAL_FROM} where ${conditions.join(" and ")}`,
    values
  );

  return NextResponse.json({ total: rows[0]?.total ?? 0 });
});
