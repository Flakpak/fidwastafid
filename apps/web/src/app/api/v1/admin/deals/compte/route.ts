import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { dealStatutSchema, type DealStatut } from "@fidwastafid/schemas";
import { withAuthErrors } from "../../../_lib/errors.js";

export const runtime = "nodejs";

const STATUTS = dealStatutSchema.options;

/**
 * GET /api/v1/admin/deals/compte — requireAdmin. Neuvième amendement
 * conscient de la liste fermée (CONTRAT-V1 §4, 04/08/2026), même esprit que
 * `GET /api/v1/deals/compte` côté public : un `count(*)` par statut, EN
 * BASE, jamais déduit de la longueur d'une liste chargée côté client.
 *
 * Avant ce lot, les compteurs des onglets admin étaient la taille d'un
 * tableau tronqué par un `LIMIT` global — « En attente (0) » pouvait
 * afficher zéro alors que des lignes existaient, une absence FAUSSE plutôt
 * qu'une simple omission (docs/INCIDENTS.md, 04/08/2026 : même motif que
 * les trois occurrences de repli silencieux déjà consignées). Endpoint
 * séparé de la liste paginée : un onglet qui ne charge que sa première
 * page ne peut pas se compter lui-même sans mentir sur ce qu'il n'a pas
 * encore chargé.
 *
 * Les cinq statuts sont toujours présents dans la réponse, à 0 s'il n'y a
 * aucune ligne — un onglet ne doit pas deviner l'absence d'une clé.
 *
 * Segment statique sous `/admin/deals` : il prime sur `[publicId]` dans le
 * routeur Next, comme `/deals/compte` sur son propre `[publicId]` — un
 * `public_id` (nanoid 10 caractères, CONTRAT-V1 §1) ne peut pas valoir
 * littéralement `compte`.
 */
export const GET = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  await requireAdmin(request);

  const rows = await query<{ statut: string; total: number }>(
    "select statut, count(*)::int as total from deals group by statut"
  );

  const comptes = Object.fromEntries(STATUTS.map((s) => [s, 0])) as Record<DealStatut, number>;
  for (const row of rows) {
    if ((STATUTS as readonly string[]).includes(row.statut)) {
      comptes[row.statut as DealStatut] = row.total;
    }
  }

  return NextResponse.json({ comptes });
});
