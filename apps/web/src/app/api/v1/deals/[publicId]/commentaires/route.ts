import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireUser } from "@fidwastafid/auth";
import { commentaireInputSchema, commentaireSchema } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { PUBLIC_STATUTS } from "../../../_lib/deals.js";
import { isRateLimited } from "../../../_lib/rateLimit.js";

type Context = { params: Promise<{ publicId: string }> };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** Curseur simple (pas de tri variable ici, contrairement aux deals) : la
 *  précision microseconde de created_at rend une collision entre deux
 *  commentaires humains pratiquement impossible, pas besoin de tie-break. */
function encodeCommentCursor(createdAt: string): string {
  return Buffer.from(createdAt, "utf8").toString("base64url");
}
function decodeCommentCursor(raw: string): string | null {
  try {
    return Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

interface CommentaireRow {
  contenu: string;
  auteur_public_id: string;
  pseudo: string;
  created_at: string;
}

/**
 * GET /api/v1/deals/:publicId/commentaires — public, sans auth. Ajouté en
 * Phase 4 : lecture symétrique du POST, omission du contrat initial
 * (CONTRAT-V1 §4 amendé dans le même commit). Même visibilité que le
 * détail public (publie/expire).
 */
export async function GET(request: Request, { params }: Context): Promise<NextResponse> {
  const { publicId } = await params;

  const dealRows = await query<{ id: string }>("select id from deals where public_id = $1 and statut = any($2)", [
    publicId,
    Array.from(PUBLIC_STATUTS),
  ]);
  const deal = dealRows[0];
  if (!deal) return apiError("NOT_FOUND", "Deal introuvable.");

  const { searchParams } = new URL(request.url);

  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), MAX_LIMIT) : DEFAULT_LIMIT;

  const cursorParam = searchParams.get("cursor");
  let cursorValue: string | null = null;
  if (cursorParam) {
    cursorValue = decodeCommentCursor(cursorParam);
    if (!cursorValue) return apiError("VALIDATION_ERROR", "Curseur invalide.");
  }

  const conditions = ["c.deal_id = $1"];
  const values: unknown[] = [deal.id];
  if (cursorValue) {
    values.push(cursorValue);
    conditions.push(`c.created_at < $${values.length}`);
  }
  values.push(limit + 1);
  const limitIdx = values.length;

  const rows = await query<CommentaireRow>(
    `select c.contenu, u.public_id as auteur_public_id, u.pseudo, c.created_at
     from commentaires c
     join users u on u.id = c.auteur_id
     where ${conditions.join(" and ")}
     order by c.created_at desc
     limit $${limitIdx}`,
    values
  );

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const data = pageRows.map((row) =>
    commentaireSchema.parse({
      contenu: row.contenu,
      auteurPublicId: row.auteur_public_id,
      pseudo: row.pseudo,
      createdAt: new Date(row.created_at).toISOString(),
    })
  );

  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? encodeCommentCursor(new Date(last.created_at).toISOString()) : null;

  return NextResponse.json({ data, nextCursor });
}

/**
 * POST /api/v1/deals/:publicId/commentaires — authentifié (requireUser).
 * Même visibilité que le détail public (publie/expire) : commenter un deal
 * en_attente/rejete/auto_draft n'a pas de sens pour un utilisateur qui ne
 * peut de toute façon pas le découvrir via l'API publique.
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const user = await requireUser(request);
  const { publicId } = await params;

  if (await isRateLimited("commentaire", request, user.id)) {
    return apiError("RATE_LIMITED", "Trop de commentaires, réessaie plus tard.");
  }

  const parsed = await parseJsonBody(request, commentaireInputSchema);
  if (!parsed.success) return parsed.response;

  const dealRows = await query<{ id: string }>("select id from deals where public_id = $1 and statut = any($2)", [
    publicId,
    Array.from(PUBLIC_STATUTS),
  ]);
  const deal = dealRows[0];
  if (!deal) return apiError("NOT_FOUND", "Deal introuvable.");

  const rows = await query<{ contenu: string; created_at: string }>(
    `insert into commentaires (deal_id, auteur_id, contenu) values ($1, $2, $3)
     returning contenu, created_at`,
    [deal.id, user.id, parsed.data.contenu]
  );
  const row = rows[0];
  if (!row) throw new Error("Insertion du commentaire échouée sans erreur SQL — ne devrait pas arriver.");

  const commentaire = commentaireSchema.parse({
    contenu: row.contenu,
    auteurPublicId: user.publicId,
    pseudo: user.pseudo,
    createdAt: new Date(row.created_at).toISOString(),
  });

  return NextResponse.json(commentaire, { status: 201 });
});
