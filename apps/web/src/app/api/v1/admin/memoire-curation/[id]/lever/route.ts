import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../../_lib/errors.js";
import { parseJsonBody } from "../../../../_lib/validation.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const leverSchema = z.object({
  motif: z.string().trim().min(3).max(500).optional(),
});

/**
 * POST /api/v1/admin/memoire-curation/:id/lever — requireAdmin. Onzième
 * amendement conscient (voir GET .../memoire-curation).
 *
 * Répond à la question posée à la conception du lot 2 : que devient un
 * deal rejeté puis légitimement republié par l'enseigne à un autre
 * moment ? Sans ceci, la mémoire de curation serait une liste noire
 * définitive — aucun moyen de revenir sur une décision. Lever ne
 * SUPPRIME rien (même principe que `deals.supprime_le`, lot 1) : pose
 * `levee_le`/`levee_par`/`levee_motif`, l'entrée reste lisible dans
 * l'historique, seul le pipeline cesse de la consulter
 * (`levee_le is null` dans sa requête de blocage).
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return apiError("VALIDATION_ERROR", "Identifiant invalide.");
  }

  const parsed = await parseJsonBody(request, leverSchema);
  if (!parsed.success) return parsed.response;

  const rows = await query<{ id: string; levee_le: string | null }>(
    `update memoire_curation
        set levee_le = now(), levee_par = $1, levee_motif = $2
      where id = $3 and levee_le is null
      returning id, levee_le`,
    [admin.id, parsed.data.motif ?? null, id]
  );

  if (!rows[0]) {
    // Distingue "n'existe pas" de "déjà levée" pour ne pas laisser croire
    // à un id fautif quand c'est un rejeu (CONTRAT-V1 §4 : CONFLICT est
    // réservé à l'état de la ressource, pas à la validité de la requête).
    const existe = await query<{ id: string }>("select id from memoire_curation where id = $1", [id]);
    if (!existe[0]) return apiError("NOT_FOUND", "Entrée de mémoire de curation introuvable.");
    return apiError("CONFLICT", "Cette décision est déjà levée.");
  }

  return NextResponse.json({ ok: true, leveeLe: rows[0].levee_le });
});
