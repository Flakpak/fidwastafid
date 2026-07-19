import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../../_lib/errors.js";
import { DEAL_ADMIN_SELECT, DEAL_FROM, toDealAdmin, type DealAdminRow } from "../../../../_lib/deals.js";
import { logAudit } from "../../../../_lib/audit.js";
import { processAndStoreDealImage, InvalidImageError, ImageProcessingError } from "../../../../_lib/dealImage.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/v1/admin/deals/:publicId/image — requireAdmin, multipart/form-data
 * (champ "image"). Fallback manuel à image-depuis-lien pour les sources qui
 * bloquent la récupération serveur (Jumia et similaires renvoient 403 aux
 * IP datacenter, y compris depuis Vercel en prod) — CONTRAT-V1 §4, troisième
 * amendement conscient du 19/07/2026, extension upload manuel.
 *
 * Aucun filtre de statut ni de présence de `lien` : contrairement à
 * image-depuis-lien, ce endpoint fonctionne sur n'importe quel deal (en
 * ligne, magasin, hanout/terrain sans lien produit).
 *
 * Même traitement que image-depuis-lien (processAndStoreDealImage) : le
 * fichier reçu passe par le sniffing magic bytes puis le ré-encodage sharp
 * avant tout stockage — le fichier ORIGINAL envoyé par l'admin n'est jamais
 * conservé tel quel.
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { publicId } = await params;

  const rows = await query<{ id: string; image_key: string | null }>(
    "select id, image_key from deals where public_id = $1",
    [publicId]
  );
  const deal = rows[0];
  if (!deal) return apiError("NOT_FOUND", "Deal introuvable.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("VALIDATION_ERROR", "Corps multipart invalide.");
  }

  const file = form.get("image");
  if (!(file instanceof Blob) || file.size === 0) {
    return apiError("VALIDATION_ERROR", 'Fichier image manquant (champ "image").', {
      image: "Fichier requis.",
    });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return apiError("VALIDATION_ERROR", "Image trop volumineuse (5 Mo maximum).", {
      image: "5 Mo maximum.",
    });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let imageKey: string;
  try {
    imageKey = await processAndStoreDealImage(publicId, buffer);
  } catch (err) {
    if (err instanceof InvalidImageError) {
      return apiError("VALIDATION_ERROR", "Type de fichier non autorisé (jpeg/png/webp uniquement).", {
        image: "Type de fichier non autorisé.",
      });
    }
    if (err instanceof ImageProcessingError) {
      return apiError("VALIDATION_ERROR", "Traitement de l'image impossible.", { image: "Traitement impossible." });
    }
    throw err;
  }

  await query("update deals set image_key = $1, updated_at = now() where id = $2", [imageKey, deal.id]);

  await logAudit({
    adminId: admin.id,
    action: "update_deal",
    cibleType: "deal",
    cibleId: publicId,
    details: { champs: { imageKey: { avant: deal.image_key, apres: imageKey } } },
  });

  const updated = await query<DealAdminRow>(`select ${DEAL_ADMIN_SELECT} ${DEAL_FROM} where d.id = $1`, [deal.id]);
  const result = updated[0];
  if (!result) throw new Error("Deal introuvable juste après mise à jour — ne devrait pas arriver.");

  return NextResponse.json(toDealAdmin(result));
});
