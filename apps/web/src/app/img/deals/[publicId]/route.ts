import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { fetchDealImageBytes } from "../../../../lib/dealImageStorage.js";
import { toOgImageJpeg } from "../../../../lib/ogImageJpeg.js";

/**
 * GET /img/deals/[publicId] — proxy d'images, volontairement hors /api/v1
 * (CONTRAT-V1 §6 : URL publique fidwastafid.com/img/deals/[public_id],
 * backend interchangeable). Exception documentée au même titre que le
 * pipeline (docs/fidwastafid-plan-v2.md, SUIVI) : c'est de l'infra de
 * service d'assets statiques, pas une ressource du domaine métier — /api/v1
 * reste la porte d'entrée unique pour tout le reste (CONTRAT-V1 §4).
 *
 * Aucun id séquentiel exposé (même règle que partout ailleurs) : on ne
 * résout que sur public_id, jamais sur l'id bigint interne.
 */
export const runtime = "nodejs";

const PUBLIC_ID_RE = /^[a-z0-9]{10}$/;

/** Protège la base des rafales de miss sans retarder une image fraîchement ingérée. */
const NOT_FOUND_HEADERS = { "Cache-Control": "public, max-age=300" };

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
}

const IMAGE_HEADERS = { "Cache-Control": "public, max-age=86400, s-maxage=2592000" };

/**
 * `?format=jpeg` — variante dédiée aux aperçus sociaux (og:image, incident du
 * 20/07/2026 : WhatsApp/Facebook gèrent mal ou pas le WebP servi par défaut
 * aux visiteurs du site, cf. lib/ogImageJpeg.ts). Les visiteurs normaux du
 * site (balise <img>, apps/web/src/app/deal/[slugAndId]/page.tsx) ne passent
 * jamais ce paramètre et continuent de recevoir le WebP d'origine.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> }
): Promise<NextResponse> {
  const { publicId } = await params;
  if (!PUBLIC_ID_RE.test(publicId)) return notFound();

  // Aucun filtre de statut : un deal expiré garde son image (URL vivante à
  // vie, CONTRAT-V1 §1) et l'admin doit pouvoir prévisualiser les auto_draft.
  const rows = await query<{ image_key: string | null }>("select image_key from deals where public_id = $1", [
    publicId,
  ]);
  const imageKey = rows[0]?.image_key;
  if (!imageKey) return notFound();

  const bytes = await fetchDealImageBytes(imageKey);
  if (!bytes) return notFound();

  const wantsJpeg = new URL(request.url).searchParams.get("format") === "jpeg";
  if (wantsJpeg) {
    const jpeg = await toOgImageJpeg(bytes);
    return new NextResponse(new Uint8Array(jpeg), {
      status: 200,
      headers: { "Content-Type": "image/jpeg", ...IMAGE_HEADERS },
    });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { "Content-Type": "image/webp", ...IMAGE_HEADERS },
  });
}
