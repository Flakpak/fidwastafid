import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../../_lib/errors.js";
import { DEAL_ADMIN_SELECT, DEAL_FROM, toDealAdmin, type DealAdminRow } from "../../../../_lib/deals.js";
import { logAudit } from "../../../../_lib/audit.js";
import { safeFetch, readLimited, SsrfGuardError } from "../../../../_lib/ssrf.js";
import { extractImageUrl } from "../../../../_lib/ogImage.js";
import { processAndStoreDealImage, InvalidImageError, ImageProcessingError } from "../../../../_lib/dealImage.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

/** UA de navigateur standard — un UA de bot générique se fait souvent
 *  bloquer par les pages marchandes (Jumia et similaires), ce que la
 *  page produit servie normalement aux visiteurs n'est pas. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * POST /api/v1/admin/deals/:publicId/image-depuis-lien — requireAdmin
 * (CONTRAT-V1 §4, troisième amendement conscient du 19/07/2026) : récupère
 * l'image produit depuis le `lien` existant du deal, pour rattraper les
 * deals collectés sans photo (pipeline auto_draft, ou deals déjà publiés
 * sans image — aucun filtre de statut ici, volontaire).
 *
 * Aucune transaction Postgres ouverte pendant le fetch/traitement externe
 * (page + image + sharp peuvent prendre plusieurs secondes) — le pool est
 * dimensionné à 2 connexions pour du serverless (packages/db/src/client.ts),
 * un verrou tenu tout ce temps affamerait le reste du service. Lecture puis
 * écriture séparées, pas de FOR UPDATE.
 */
export const POST = withAuthErrors<Context>(async (request, { params }) => {
  const admin = await requireAdmin(request);
  const { publicId } = await params;

  const rows = await query<{ id: string; lien: string | null; image_key: string | null }>(
    "select id, lien, image_key from deals where public_id = $1",
    [publicId]
  );
  const deal = rows[0];
  if (!deal) return apiError("NOT_FOUND", "Deal introuvable.");
  if (!deal.lien) return apiError("VALIDATION_ERROR", "Ce deal n'a pas de lien.");

  let html: string;
  try {
    const pageResponse = await safeFetch(
      deal.lien,
      { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } },
      { timeoutMs: FETCH_TIMEOUT_MS }
    );
    if (!pageResponse.ok) {
      return apiError("VALIDATION_ERROR", "Impossible de récupérer la page du lien.");
    }
    const htmlBuffer = await readLimited(pageResponse, MAX_HTML_BYTES);
    html = htmlBuffer.toString("utf-8");
  } catch (err) {
    if (err instanceof SsrfGuardError) return apiError("VALIDATION_ERROR", "Lien non autorisé.");
    return apiError("VALIDATION_ERROR", "Impossible de récupérer la page du lien.");
  }

  const imageUrl = extractImageUrl(html, deal.lien);
  if (!imageUrl) {
    return apiError("VALIDATION_ERROR", "Aucune image trouvée sur la page (og:image absent).");
  }

  let imageBuffer: Buffer;
  try {
    const imageResponse = await safeFetch(
      imageUrl,
      { headers: { "User-Agent": USER_AGENT, Accept: "image/*" } },
      { timeoutMs: FETCH_TIMEOUT_MS }
    );
    const contentType = imageResponse.headers.get("content-type") ?? "";
    if (!imageResponse.ok || !contentType.startsWith("image/")) {
      return apiError("VALIDATION_ERROR", "Image introuvable ou invalide.");
    }
    imageBuffer = await readLimited(imageResponse, MAX_IMAGE_BYTES);
  } catch (err) {
    if (err instanceof SsrfGuardError) return apiError("VALIDATION_ERROR", "Lien non autorisé.");
    return apiError("VALIDATION_ERROR", "Image introuvable ou invalide.");
  }

  let imageKey: string;
  try {
    imageKey = await processAndStoreDealImage(publicId, imageBuffer);
  } catch (err) {
    if (err instanceof InvalidImageError) return apiError("VALIDATION_ERROR", "Image introuvable ou invalide.");
    if (err instanceof ImageProcessingError) return apiError("VALIDATION_ERROR", "Traitement de l'image impossible.");
    throw err;
  }

  await query("update deals set image_key = $1, updated_at = now() where id = $2", [imageKey, deal.id]);

  await logAudit({
    adminId: admin.id,
    action: "update_image_depuis_lien",
    cibleType: "deal",
    cibleId: publicId,
    details: { avant: deal.image_key, apres: imageKey, lien: deal.lien },
  });

  const updated = await query<DealAdminRow>(`select ${DEAL_ADMIN_SELECT} ${DEAL_FROM} where d.id = $1`, [deal.id]);
  const result = updated[0];
  if (!result) throw new Error("Deal introuvable juste après mise à jour — ne devrait pas arriver.");

  return NextResponse.json(toDealAdmin(result));
});
