import { NextResponse } from "next/server";
import { query, withTransaction, type PoolClient } from "@fidwastafid/db";
import { requireUser } from "@fidwastafid/auth";
import { meUpdateSchema } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../_lib/errors.js";
import { parseJsonBody } from "../_lib/validation.js";
import { isRateLimited } from "../_lib/rateLimit.js";
import { buildMe } from "../_lib/me.js";
import { deleteAuthUser } from "../_lib/supabaseAdmin.js";
import { recalculateScore } from "../_lib/deals.js";

/** GET /api/v1/me — profil courant (CONTRAT-V1 §4, amendement 16/07/2026). */
export const GET = withAuthErrors(async (request) => {
  const user = await requireUser(request);
  return NextResponse.json(await buildMe(user));
});

/** Code Postgres 23505 = unique_violation — le mapping fin (quelle colonne)
 *  n'est pas nécessaire ici : le seul UNIQUE de la table users porte sur
 *  pseudo (public_id est généré côté serveur, jamais fourni par le client). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

/**
 * PATCH /api/v1/me — rectification (loi 09-08). Champs optionnels,
 * `coalesce` en base pour ne toucher que ceux fournis. L'unicité du pseudo
 * est portée par la contrainte DB (packages/db, migration 0006) — l'erreur
 * 23505 est traduite en VALIDATION_ERROR plutôt que de remonter en 500.
 */
export const PATCH = withAuthErrors(async (request) => {
  const user = await requireUser(request);

  if (await isRateLimited("profil", request, user.id)) {
    return apiError("RATE_LIMITED", "Trop de modifications, réessaie plus tard.");
  }

  const parsed = await parseJsonBody(request, meUpdateSchema);
  if (!parsed.success) return parsed.response;
  const { pseudo, couleurAvatar } = parsed.data;

  try {
    await query(
      `update users set pseudo = coalesce($2, pseudo), couleur_avatar = coalesce($3, couleur_avatar)
       where id = $1`,
      [user.id, pseudo ?? null, couleurAvatar ?? null]
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return apiError("VALIDATION_ERROR", "Ce pseudo est déjà pris.");
    }
    throw err;
  }

  return NextResponse.json(await buildMe(user));
});

/**
 * DELETE /api/v1/me — effacement (loi 09-08). Transaction : commentaires
 * anonymisés (contenu conservé, auteur_id -> null), votes supprimés (un
 * vote anonyme fausse les scores — recalcul des deals affectés), deals
 * soumis conservés (submitter_id -> null), ligne users supprimée, puis
 * suppression du compte Supabase Auth. Si cette dernière étape échoue, on
 * jette pour déclencher le ROLLBACK de toute la transaction (withTransaction)
 * plutôt que de laisser une base sans compte auth correspondant.
 */
export const DELETE = withAuthErrors(async (request) => {
  const user = await requireUser(request);

  await withTransaction(async (client: PoolClient) => {
    await client.query("update commentaires set auteur_id = null where auteur_id = $1", [user.id]);

    const affected = await client.query<{ deal_id: string }>(
      "select distinct deal_id from votes where user_id = $1",
      [user.id]
    );
    await client.query("delete from votes where user_id = $1", [user.id]);
    for (const row of affected.rows) {
      await recalculateScore(client, row.deal_id);
    }

    await client.query("update deals set submitter_id = null where submitter_id = $1", [user.id]);

    // Table marqueur sans ON DELETE CASCADE — no-op si l'utilisateur n'est pas admin.
    await client.query("delete from admins where id = $1", [user.id]);

    await client.query("delete from users where id = $1", [user.id]);

    const authDeleted = await deleteAuthUser(user.id);
    if (!authDeleted) {
      throw new Error("Suppression du compte Supabase Auth échouée — transaction annulée.");
    }
  });

  return NextResponse.json({ ok: true });
});
