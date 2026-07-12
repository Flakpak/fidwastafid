import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireUser } from "@fidwastafid/auth";
import { commentaireInputSchema, commentaireSchema } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { PUBLIC_STATUTS } from "../../../_lib/deals.js";
import { isRateLimited } from "../../../_lib/rateLimit.js";

type Context = { params: Promise<{ publicId: string }> };

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
    createdAt: new Date(row.created_at).toISOString(),
  });

  return NextResponse.json(commentaire, { status: 201 });
});
