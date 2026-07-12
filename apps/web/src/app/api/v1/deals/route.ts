import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireUser } from "@fidwastafid/auth";
import { dealInputSchema, generatePublicId } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../_lib/errors.js";
import { parseJsonBody } from "../_lib/validation.js";
import { isRateLimited } from "../_lib/rateLimit.js";
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

/**
 * POST /api/v1/deals — soumission communautaire, authentifiée (requireUser).
 * Toujours créé en `en_attente` (CONTRAT-V1 §4 : "la machine collecte,
 * l'humain publie" — la validation admin est un acte séparé, PATCH
 * /api/v1/admin/deals/:publicId).
 */
export const POST = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  const user = await requireUser(request);

  if (await isRateLimited("soumission", request, user.id)) {
    return apiError("RATE_LIMITED", "Trop de soumissions, réessaie plus tard.");
  }

  const parsed = await parseJsonBody(request, dealInputSchema);
  if (!parsed.success) return parsed.response;
  const input = parsed.data;

  const enseigneRows = await query<{ id: number }>("select id from enseignes where slug = $1", [
    input.enseigneSlug,
  ]);
  if (!enseigneRows[0]) {
    return apiError("VALIDATION_ERROR", `enseigneSlug: enseigne "${input.enseigneSlug}" inconnue.`);
  }

  const publicId = generatePublicId();

  await query(
    `insert into deals
       (public_id, titre, enseigne_id, ville, categorie, type, prix_promo,
        prix_normal, date_fin, description, lien, image_key, statut, submitter_id, score)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'en_attente',$13,0)`,
    [
      publicId,
      input.titre,
      enseigneRows[0].id,
      input.ville ?? null,
      input.categorie,
      input.type,
      input.prixPromo,
      input.prixNormal ?? null,
      input.dateFin ?? null,
      input.description ?? null,
      input.lien ?? null,
      input.imageKey ?? null,
      user.id,
    ]
  );

  // Relecture jointe (enseigne/submitter) plutôt qu'un RETURNING simple,
  // pour repasser par le même toDeal() que le reste de l'API.
  const rows = await query<DealRow>(`select ${DEAL_SELECT} ${DEAL_FROM} where d.public_id = $1`, [publicId]);
  const created = rows[0];
  if (!created) throw new Error("Deal introuvable juste après insertion — ne devrait pas arriver.");

  return NextResponse.json(toDeal(created), { status: 201 });
});
