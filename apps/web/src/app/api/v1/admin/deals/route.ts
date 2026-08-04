import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { dealStatutSchema } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../_lib/errors.js";
import {
  DEAL_ADMIN_SELECT,
  DEAL_FROM,
  DEAL_DOUBLON_JOIN,
  DEAL_DOUBLON_SELECT,
  REMISE_EXPR,
  triPourStatut,
  toDealAdmin,
  toDoublon,
  type DealAdminRow,
  type DoublonColumns,
} from "../../_lib/deals.js";
import { decodeAdminCursor, encodeAdminCursor } from "../../_lib/adminDealsCursor.js";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * GET /api/v1/admin/deals — requireAdmin. `statut` est OBLIGATOIRE : un
 * onglet interroge SON statut, jamais la table entière (neuvième amendement
 * conscient de la liste fermée, CONTRAT-V1 §4, 04/08/2026).
 *
 * Avant ce lot, l'endpoint chargeait tous statuts confondus (`LIMIT 1000`)
 * et le tri/filtre par onglet se faisait côté client sur ce tableau déjà
 * tronqué — une soumission `en_attente` récente pouvait rester hors de la
 * fenêtre du `LIMIT` (938 lignes à égalité de score, départagées par
 * `public_id`, arbitraire) et donc invisible, sans qu'aucun filtre ni
 * jointure ne l'exclue réellement (docs/INCIDENTS.md, 04/08/2026). Filtrer
 * par statut EN BASE rend ce mode de défaillance impossible : la file
 * `en_attente` n'interroge jamais que les lignes `en_attente`.
 *
 * Pagination par curseur (`_lib/adminDealsCursor.ts`), même mécanique que
 * le feed public (`deals/route.ts`) : jamais d'offset, jamais de `LIMIT`
 * global masquant silencieusement des lignes. Les compteurs par onglet
 * viennent de `GET /api/v1/admin/deals/compte` (`count(*)` en base), pas
 * de la longueur de cette liste — un onglet paginé ne peut pas se compter
 * lui-même sans mentir sur ce qu'il ne charge pas encore.
 */
export const GET = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  await requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const statutParsed = dealStatutSchema.safeParse(searchParams.get("statut"));
  if (!statutParsed.success) {
    return apiError("VALIDATION_ERROR", "Paramètre statut requis, parmi les statuts connus.");
  }
  const statut = statutParsed.data;
  const tri = triPourStatut(statut);

  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), MAX_LIMIT) : DEFAULT_LIMIT;

  const cursorParam = searchParams.get("cursor");
  let cursor = null;
  if (cursorParam) {
    cursor = decodeAdminCursor(cursorParam);
    // Un curseur d'un AUTRE onglet (statut) ou d'un autre tri pointerait une
    // position dans une file qui n'est pas celle-ci — même garde que le
    // feed public sur sa signature de filtres.
    if (!cursor || cursor.statut !== statut || cursor.tri !== tri) {
      return apiError("VALIDATION_ERROR", "Curseur invalide pour cet onglet.");
    }
  }

  const values: unknown[] = [statut];
  const conditions = ["d.statut = $1"];

  const sortColumn = tri === "recent_asc" ? "d.created_at" : REMISE_EXPR;
  const direction = tri === "recent_asc" ? "asc" : "desc";
  const compare = tri === "recent_asc" ? ">" : "<";

  if (cursor) {
    const cast = tri === "recent_asc" ? "::timestamptz" : "";
    const cursorValue = tri === "recent_asc" ? cursor.value : Number(cursor.value);
    values.push(cursorValue);
    const valueIdx = values.length;
    values.push(cursor.publicId);
    const publicIdIdx = values.length;
    // Tie-break sur public_id (jamais l'id interne — CONTRAT-V1 §1), même
    // sens que le tri principal : une file croissante se départage en
    // croissant, une file décroissante en décroissant.
    conditions.push(
      `(${sortColumn} ${compare} $${valueIdx}${cast} OR (${sortColumn} = $${valueIdx}${cast} AND d.public_id ${compare} $${publicIdIdx}))`
    );
  }

  values.push(limit + 1);
  const limitIdx = values.length;

  // `tri_valeur` sélectionné explicitement uniquement pour `remise_desc` —
  // nécessaire pour réencoder le curseur de la page suivante avec la même
  // expression que le ORDER BY/WHERE ci-dessus (comme `tendance_rang`,
  // feed public).
  const selectExtra = tri === "remise_desc" ? `, ${sortColumn} as tri_valeur` : "";

  const rows = await query<DealAdminRow & DoublonColumns & { tri_valeur?: number }>(
    `select ${DEAL_ADMIN_SELECT}, ${DEAL_DOUBLON_SELECT}${selectExtra}
     ${DEAL_FROM}
     ${DEAL_DOUBLON_JOIN}
     where ${conditions.join(" and ")}
     order by ${sortColumn} ${direction}, d.public_id ${direction}
     limit $${limitIdx}`,
    values
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  const last = pageRows[pageRows.length - 1];
  if (hasMore && last) {
    const value = tri === "recent_asc" ? new Date(last.created_at).toISOString() : String(last.tri_valeur);
    nextCursor = encodeAdminCursor({ statut, tri, value, publicId: last.public_id });
  }

  const data = pageRows.map((row) => ({ ...toDealAdmin(row), doublon: toDoublon(row) }));

  return NextResponse.json({ data, nextCursor });
});
