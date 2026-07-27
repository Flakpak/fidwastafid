import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { lireFiltres } from "../../_lib/dealsFilters.js";
import { assemblerFacettes, requeteFacettes, type FacetteRow } from "../../_lib/dealsFacettes.js";

export const runtime = "nodejs";

/**
 * GET /api/v1/deals/facettes — public, sans auth.
 *
 * Septième amendement conscient de la liste fermée d'endpoints
 * (CONTRAT-V1 §4). Mêmes paramètres de filtre que `GET /api/v1/deals`
 * (statut, enseigne, ville, categorie, type, q), aucune pagination : la
 * réponse est le nombre de deals que CETTE liste renverrait, plus le
 * nombre par catégorie et par ville si l'on changeait cette seule dimension.
 *
 * Endpoint séparé et non champ ajouté à `GET /api/v1/deals` : la feuille de
 * filtres recalcule les compteurs pendant que l'utilisateur compose sa
 * sélection, AVANT de l'appliquer — donc sans recharger la liste. Les coller
 * à la liste aurait imposé de télécharger 24 deals à chaque case cochée.
 *
 * Segment statique `facettes` sous `/deals` : il prime sur `[publicId]` dans
 * le routeur Next, et ne peut de toute façon pas entrer en collision avec un
 * public_id (nanoid de 10 caractères — CONTRAT-V1 §1).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const filtres = lireFiltres(searchParams);

  const { text, values } = requeteFacettes(filtres);
  const rows = await query<FacetteRow>(text, values);

  return NextResponse.json(assemblerFacettes(rows));
}
