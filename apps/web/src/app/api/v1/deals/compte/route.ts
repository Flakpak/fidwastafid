import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { lireFiltres } from "../../_lib/dealsFilters.js";
import { requeteTotal, type TotalDeals } from "../../_lib/dealsTotal.js";

export const runtime = "nodejs";

/**
 * GET /api/v1/deals/compte — public, sans auth.
 *
 * Septième amendement conscient de la liste fermée d'endpoints
 * (CONTRAT-V1 §4). Mêmes paramètres de filtre que `GET /api/v1/deals`
 * (statut, enseigne, ville, categorie, type, q), aucune pagination : la
 * réponse est le nombre de deals que CETTE liste renverrait.
 *
 * Endpoint séparé et non champ ajouté à `GET /api/v1/deals` : la feuille de
 * filtres annonce le nombre de résultats pendant que l'utilisateur compose sa
 * sélection, AVANT de l'appliquer — donc sans recharger la liste. Le coller à
 * la liste imposerait de télécharger une page de deals à chaque option cochée.
 *
 * Segment statique sous `/deals` : il prime sur `[publicId]` dans le routeur
 * Next, et ne peut de toute façon pas entrer en collision avec un public_id
 * (nanoid de 10 caractères — CONTRAT-V1 §1).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filtres = lireFiltres(searchParams);

  const { text, values } = requeteTotal(filtres);
  const rows = await query<TotalDeals>(text, values);

  return NextResponse.json({ total: rows[0]?.total ?? 0 } satisfies TotalDeals);
}
