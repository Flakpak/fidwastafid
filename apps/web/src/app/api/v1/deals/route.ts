import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { apiError } from "../_lib/errors.js";
import { decodeCursor, encodeCursor, type TriDeals } from "../_lib/pagination.js";
import { DEAL_SELECT, DEAL_FROM, PUBLIC_STATUTS, toDeal, type DealRow } from "../_lib/deals.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * GET /api/v1/deals — public, sans auth (CONTRAT-V1 §4).
 * Filtres : statut (restreint aux valeurs publiques, `publie` par défaut —
 * en_attente/rejete/auto_draft ne sortent jamais de cet endpoint non
 * authentifié, c'est le rôle de /api/v1/admin/deals), enseigne, ville,
 * categorie, type. Pagination par curseur (jamais offset), tri score|recent.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const statutParam = searchParams.get("statut");
  const statut = statutParam && PUBLIC_STATUTS.has(statutParam) ? statutParam : "publie";

  const tri: TriDeals = searchParams.get("tri") === "recent" ? "recent" : "score";

  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), MAX_LIMIT) : DEFAULT_LIMIT;

  const cursorParam = searchParams.get("cursor");
  let cursor = null;
  if (cursorParam) {
    cursor = decodeCursor(cursorParam);
    if (!cursor || cursor.tri !== tri) {
      return apiError("VALIDATION_ERROR", "Curseur invalide pour ce tri.");
    }
  }

  const conditions: string[] = ["d.statut = $1"];
  const values: unknown[] = [statut];

  const pushCondition = (column: string, value: string | null) => {
    if (!value) return;
    values.push(value);
    conditions.push(`${column} = $${values.length}`);
  };
  pushCondition("e.slug", searchParams.get("enseigne"));
  pushCondition("d.ville", searchParams.get("ville"));
  pushCondition("d.categorie", searchParams.get("categorie"));
  pushCondition("d.type", searchParams.get("type"));

  const sortColumn = tri === "score" ? "d.score" : "d.created_at";

  if (cursor) {
    const cursorValue = tri === "score" ? Number(cursor.value) : cursor.value;
    values.push(cursorValue);
    const valueIdx = values.length;
    values.push(cursor.publicId);
    const publicIdIdx = values.length;
    // Tie-break sur public_id (jamais l'id interne — CONTRAT-V1 §1).
    conditions.push(
      `(${sortColumn} < $${valueIdx} OR (${sortColumn} = $${valueIdx} AND d.public_id < $${publicIdIdx}))`
    );
  }

  values.push(limit + 1);
  const limitIdx = values.length;

  const rows = await query<DealRow>(
    `select ${DEAL_SELECT}
     ${DEAL_FROM}
     where ${conditions.join(" and ")}
     order by ${sortColumn} desc, d.public_id desc
     limit $${limitIdx}`,
    values
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  const last = pageRows[pageRows.length - 1];
  if (hasMore && last) {
    nextCursor = encodeCursor({
      tri,
      value: tri === "score" ? String(last.score) : new Date(last.created_at).toISOString(),
      publicId: last.public_id,
    });
  }

  return NextResponse.json({ data: pageRows.map(toDeal), nextCursor });
}
