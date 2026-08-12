import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { withAuthErrors } from "../../../_lib/errors.js";

export const runtime = "nodejs";

const LIMITE_PAR_SOURCE = 20;

interface PipelineRunRow {
  source: string;
  cause: string;
  extraits: number;
  retenus: number;
  inseres: number;
  doublons: number;
  run_id: number;
  cree_le: string;
}

/**
 * GET /api/v1/admin/pipeline/historique — requireAdmin. Lecture seule de
 * `pipeline_runs` (migration 0020, lot supervision du 12/08/2026) : les
 * quatre chiffres par source et par run, groupés par source, les plus
 * récents d'abord — la « lecture » prévue à côté de la persistance, pour
 * que ces chiffres ne restent pas des lignes qu'on écrit sans jamais
 * regarder (des chiffres persistés que personne ne consulte ne valent pas
 * mieux que des logs qui expirent).
 *
 * Pas d'écran admin dédié dans ce lot — volontairement : le jour même de ce
 * lot, une UI admin fusionnée sans vérification visuelle a cassé /admin en
 * production (docs/INCIDENTS.md, 12/08/2026). Cet endpoint seul, à
 * interroger directement (curl authentifié) ou depuis un futur écran
 * revu comme tel — pas ajouté ici sous la même pression de temps.
 *
 * `row_number() over (partition by source ...)` — même discipline que les
 * autres endpoints admin : jamais tout charger puis tronquer côté client,
 * la limite par source est appliquée EN BASE.
 */
export const GET = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  await requireAdmin(request);

  const rows = await query<PipelineRunRow>(
    `select source, cause, extraits, retenus, inseres, doublons, run_id, cree_le
     from (
       select *, row_number() over (partition by source order by cree_le desc) as rn
       from pipeline_runs
     ) t
     where rn <= $1
     order by source, cree_le desc`,
    [LIMITE_PAR_SOURCE]
  );

  const historique: Record<string, PipelineRunRow[]> = {};
  for (const row of rows) {
    (historique[row.source] ??= []).push(row);
  }

  return NextResponse.json({ historique });
});
