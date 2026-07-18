import { NextResponse } from "next/server";
import { withTransaction } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { dealStatutUpdateSchema } from "@fidwastafid/schemas";
import { apiError, withAuthErrors } from "../../../_lib/errors.js";
import { parseJsonBody } from "../../../_lib/validation.js";
import { DEAL_ADMIN_SELECT, DEAL_FROM, toDealAdmin, type DealAdminRow } from "../../../_lib/deals.js";
import { logAudit } from "../../../_lib/audit.js";

type Context = { params: Promise<{ publicId: string }> };

/**
 * PATCH /api/v1/admin/deals/:publicId — requireAdmin. Changement de statut +
 * édition curateur des champs terrain (CONTRAT-V1 §3, amendement du
 * 18/07/2026 : l'admin peut enrichir un deal du pipeline). Tout tracé dans
 * journal_audit dans la même transaction (pas d'action admin sans sa trace).
 *
 * `coalesce` sur les champs terrain — même pattern que PATCH /api/v1/me :
 * un champ omis du corps de la requête laisse la valeur existante intacte,
 * il n'y a pas de moyen de "l'effacer" via ce endpoint (limite acceptée,
 * cohérente avec le reste de l'API).
 */
export const PATCH = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { publicId } = await params;

  const parsed = await parseJsonBody(request, dealStatutUpdateSchema);
  if (!parsed.success) return parsed.response;
  const { statut, motifRejet, nomVendeur, adresse, lienMaps, whatsappContact, whatsappPublic } = parsed.data;

  const result = await withTransaction(async (client) => {
    const before = await client.query<{ id: string; statut: string }>(
      "select id, statut from deals where public_id = $1 for update",
      [publicId]
    );
    const deal = before.rows[0];
    if (!deal) return null;

    await client.query(
      `update deals set
         statut = $1,
         motif_rejet = coalesce($2, motif_rejet),
         nom_vendeur = coalesce($3, nom_vendeur),
         adresse = coalesce($4, adresse),
         lien_maps = coalesce($5, lien_maps),
         whatsapp_contact = coalesce($6, whatsapp_contact),
         whatsapp_public = coalesce($7, whatsapp_public),
         updated_at = now()
       where id = $8`,
      [
        statut,
        motifRejet ?? null,
        nomVendeur ?? null,
        adresse ?? null,
        lienMaps ?? null,
        whatsappContact ?? null,
        whatsappPublic ?? null,
        deal.id,
      ]
    );

    await logAudit(
      {
        adminId: admin.id,
        action: "update_statut",
        cibleType: "deal",
        cibleId: publicId,
        details: { avant: deal.statut, apres: statut },
      },
      client
    );

    const updated = await client.query<DealAdminRow>(`select ${DEAL_ADMIN_SELECT} ${DEAL_FROM} where d.id = $1`, [
      deal.id,
    ]);
    return updated.rows[0] ?? null;
  });

  if (!result) return apiError("NOT_FOUND", "Deal introuvable.");
  return NextResponse.json(toDealAdmin(result));
});
