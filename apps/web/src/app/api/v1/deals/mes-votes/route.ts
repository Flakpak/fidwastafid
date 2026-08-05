import { NextResponse } from "next/server";
import { requireUser } from "@fidwastafid/auth";
import { publicIdSchema, MES_VOTES_MAX_IDS } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../_lib/errors.js";
import { fetchMesVotes } from "../../_lib/votes.js";

export const runtime = "nodejs";

/**
 * GET /api/v1/deals/mes-votes?ids=a,b,c — requireUser. Vote courant de
 * l'appelant pour chacun des deals demandés (CONTRAT-V1 §4, seizième
 * amendement conscient — voir §3, « état voté persistant »).
 *
 * Jamais appelé par un visiteur anonyme (le client ne l'invoque que s'il
 * connaît déjà un utilisateur connecté) — mais reste `requireUser` ici
 * aussi, défense en profondeur : ce endpoint ne doit jamais révéler le vote
 * de quelqu'un d'autre que l'appelant lui-même.
 *
 * Segment statique sous `/deals` : il prime sur `[publicId]` dans le
 * routeur Next, même garantie que `/deals/compte` (un `public_id` nanoid ne
 * peut jamais valoir littéralement `mes-votes`).
 */
export const GET = withAuthErrors(async (request: Request): Promise<NextResponse> => {
  const user = await requireUser(request);

  const { searchParams } = new URL(request.url);
  const idsBrut = searchParams.get("ids");
  if (!idsBrut) return apiError("VALIDATION_ERROR", "Paramètre ids requis.");

  const ids = idsBrut
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) return apiError("VALIDATION_ERROR", "Paramètre ids vide.");
  if (ids.length > MES_VOTES_MAX_IDS) {
    return apiError("VALIDATION_ERROR", `Au plus ${MES_VOTES_MAX_IDS} identifiants à la fois.`);
  }
  for (const id of ids) {
    if (!publicIdSchema.safeParse(id).success) {
      return apiError("VALIDATION_ERROR", `Identifiant invalide : "${id}".`);
    }
  }

  const votes = await fetchMesVotes(user.id, ids);
  return NextResponse.json({ votes });
});
