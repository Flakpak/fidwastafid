import { NextResponse } from "next/server";
import { withTransaction } from "@fidwastafid/db";
import { requireUser } from "@fidwastafid/auth";
import { voteInputSchema } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { toDeal, lockDealIdByPublicId, recalculateScore, fetchDealById } from "../../../_lib/deals.js";

type Context = { params: Promise<{ publicId: string }> };

/**
 * POST /api/v1/deals/:publicId/votes — upsert (un seul vote courant par
 * utilisateur/deal, CONTRAT-V1 §4). Le score est recalculé de façon
 * synchrone, dans la même transaction que le vote (décision explicite :
 * pas de trigger, pas d'async).
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const user = await requireUser(request);
  const { publicId } = await params;

  const parsed = await parseJsonBody(request, voteInputSchema);
  if (!parsed.success) return parsed.response;
  const { sens } = parsed.data;

  const result = await withTransaction(async (client) => {
    const dealId = await lockDealIdByPublicId(client, publicId);
    if (!dealId) return null;

    await client.query(
      `insert into votes (deal_id, user_id, sens)
       values ($1, $2, $3)
       on conflict (deal_id, user_id) do update set sens = excluded.sens, updated_at = now()`,
      [dealId, user.id, sens]
    );

    await recalculateScore(client, dealId);
    return fetchDealById(client, dealId);
  });

  if (!result) return apiError("NOT_FOUND", "Deal introuvable.");
  return NextResponse.json(toDeal(result));
});

/** DELETE /api/v1/deals/:publicId/votes — retirer son vote, même recalcul synchrone. */
export const DELETE = withAuthErrors<Context>(async (request, { params }) => {
  const user = await requireUser(request);
  const { publicId } = await params;

  const result = await withTransaction(async (client) => {
    const dealId = await lockDealIdByPublicId(client, publicId);
    if (!dealId) return null;

    await client.query("delete from votes where deal_id = $1 and user_id = $2", [dealId, user.id]);

    await recalculateScore(client, dealId);
    return fetchDealById(client, dealId);
  });

  if (!result) return apiError("NOT_FOUND", "Deal introuvable.");
  return NextResponse.json(toDeal(result));
});
