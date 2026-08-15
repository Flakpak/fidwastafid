import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../../_lib/errors.js";
import { logAudit } from "../../../../_lib/audit.js";
import { lienDiffusion, buildLegendeWhatsapp } from "../../../../_lib/diffusionMessage.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

interface DealRow {
  titre: string;
  statut: string;
  prix_promo: string;
  prix_normal: string | null;
  enseigne_nom: string | null;
}

/**
 * POST /api/v1/admin/deals/:publicId/partage-whatsapp — requireAdmin.
 * CONTRAT-V1 §4, vingt-et-unième amendement conscient. Partage MANUEL
 * (WhatsApp n'offre aucune API de publication conforme et gratuite,
 * docs/IDEES.md § « WhatsApp / Facebook / Instagram gratuits — étude
 * fermée ») : cette route ne poste nulle part, elle construit le texte
 * prêt à coller et journalise qu'il a été généré — jamais qu'il a été
 * réellement diffusé, ce qui n'est pas vérifiable depuis ce dépôt.
 *
 * N'ÉCRIT JAMAIS dans `diffusions` ni ne lit `deja_diffuse` : aucune
 * interférence avec Telegram/Discord — générer un message WhatsApp ne
 * bloque ni ne simule une diffusion sur ces deux canaux, et réciproquement.
 * `whatsapp_message_genere` est un type d'action volontairement absent de
 * la liste probante de `deals_protection` (migration 0015) — repli
 * protecteur automatique, aucune migration requise pour ce lot.
 *
 * Réservé à un deal `publie` (même garde que la diffusion automatisée) :
 * partager un deal qui n'a pas de fiche publique n'a pas de sens.
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { publicId } = await params;

  const rows = await query<DealRow>(
    `select d.titre, d.statut, d.prix_promo, d.prix_normal, e.nom as enseigne_nom
       from deals d
       left join enseignes e on e.id = d.enseigne_id
      where d.public_id = $1`,
    [publicId]
  );
  const deal = rows[0];
  if (!deal) return apiError("NOT_FOUND", "Deal introuvable.");
  if (deal.statut !== "publie") {
    return apiError("CONFLICT", `Seul un deal publié peut être partagé (statut actuel : ${deal.statut}).`);
  }

  const lien = lienDiffusion(deal.titre, publicId, "whatsapp");
  const message = buildLegendeWhatsapp({
    titre: deal.titre,
    prixPromo: Number(deal.prix_promo),
    prixNormal: deal.prix_normal === null ? null : Number(deal.prix_normal),
    enseigneNom: deal.enseigne_nom,
    lien,
  });

  await logAudit({ adminId: admin.id, action: "whatsapp_message_genere", cibleType: "deal", cibleId: publicId });

  return NextResponse.json({ message });
});
