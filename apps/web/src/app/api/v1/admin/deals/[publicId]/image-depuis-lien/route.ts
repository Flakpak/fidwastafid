import { NextResponse } from "next/server";
import sharp from "sharp";
import { query } from "@fidwastafid/db";
import { requireAdmin } from "@fidwastafid/auth";
import { apiError, withAuthErrors } from "../../../../_lib/errors.js";
import { DEAL_ADMIN_SELECT, DEAL_FROM, toDealAdmin, type DealAdminRow } from "../../../../_lib/deals.js";
import { logAudit } from "../../../../_lib/audit.js";
import { safeFetch, readLimited, SsrfGuardError } from "../../../../_lib/ssrf.js";
import { extractImageUrl } from "../../../../_lib/ogImage.js";

export const runtime = "nodejs";

type Context = { params: Promise<{ publicId: string }> };

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_DIMENSION = 1200;
const WEBP_QUALITY = 80;

/** UA de navigateur standard — un UA de bot générique se fait souvent
 *  bloquer par les pages marchandes (Jumia et similaires), ce que la
 *  page produit servie normalement aux visiteurs n'est pas. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function storageHeaders(extra: HeadersInit = {}): HeadersInit {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquant.");
  return { apikey: secretKey, ...extra };
}

/**
 * Upload vers Supabase Storage — même approche fetch nu que
 * apps/web/src/app/img/deals/[publicId]/route.ts (CONTRAT-V1 §6). URL
 * construite depuis SUPABASE_URL (variable d'env serveur, jamais une
 * entrée utilisateur) : pas de garde SSRF ici, contrairement au fetch de
 * la page/l'image du deal ci-dessous.
 * `x-upsert: true` : le deal peut déjà avoir une image (rattrapage d'un
 * deal Jumia déjà publié) — remplacement, pas seulement création.
 */
async function uploadDealImage(imageKey: string, buffer: Buffer): Promise<void> {
  const url = `${process.env.SUPABASE_URL}/storage/v1/object/deals-images/${imageKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: storageHeaders({ "Content-Type": "image/webp", "x-upsert": "true" }),
    // `Buffer` (sous-classe de Uint8Array à paramètre générique) ne matche
    // pas structurellement BodyInit selon les types lib.dom — vue plate en
    // Uint8Array, acceptée par fetch() aussi bien à l'exécution qu'aux types.
    body: new Uint8Array(buffer),
  });
  if (!response.ok) {
    throw new Error(`Upload Supabase Storage échoué (HTTP ${response.status}).`);
  }
}

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

  let processed: Buffer;
  try {
    processed = await sharp(imageBuffer)
      .rotate() // auto-oriente selon l'EXIF avant que webp() ne l'efface
      .resize({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    return apiError("VALIDATION_ERROR", "Traitement de l'image impossible.");
  }

  // `deals/{publicId}.webp` — même clé qu'un remplacement précédent
  // (rattrapage). Limite acceptée (CONTRAT-V1 §6) : la route proxy
  // /img/deals/[publicId] sert avec s-maxage=2592000 (30 jours) — si ce
  // deal avait DÉJÀ une image en cache edge, le remplacement peut tarder à
  // apparaître publiquement jusqu'à 30 jours. Non problématique pour le cas
  // initial (deal sans image, `deal.image_key` était déjà null : aucun
  // cache préexistant à purger) — seul le cas "remplacement d'une image
  // existante" hérite de cette latence, aucune purge active n'est faite ici.
  const imageKey = `deals/${publicId}.webp`;
  await uploadDealImage(imageKey, processed);

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
