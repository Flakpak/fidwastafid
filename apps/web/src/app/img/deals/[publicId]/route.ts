import { NextResponse } from "next/server";
import { resolveDealImageKey } from "../_lib/lookup.js";
import { fetchDealImageBytes } from "../../../../lib/dealImageStorage.js";

/**
 * GET /img/deals/[publicId] — proxy d'images WebP, volontairement hors
 * /api/v1 (CONTRAT-V1 §6 : URL publique fidwastafid.com/img/deals/[public_id],
 * backend interchangeable). Exception documentée au même titre que le
 * pipeline (docs/fidwastafid-plan-v2.md, SUIVI) : c'est de l'infra de
 * service d'assets statiques, pas une ressource du domaine métier — /api/v1
 * reste la porte d'entrée unique pour tout le reste (CONTRAT-V1 §4).
 *
 * Sert exclusivement le WebP d'origine — la variante JPEG des aperçus
 * sociaux vit sur un chemin dédié (./og.jpg/route.ts), pas un `?format=`
 * ici : incident du 21/07/2026, le crawler Meta a fetché cette URL SANS le
 * `?format=jpeg` alors présent dans og:image (tronqué côté crawler, vérifié
 * par curl — ni la route ni le cache Vercel ne perdaient le paramètre), et
 * reçu le WebP par défaut, rejeté à l'affichage. Un chemin sans query
 * échappe par construction à ce genre de troncature de query string.
 */
export const runtime = "nodejs";

/** Protège la base des rafales de miss sans retarder une image fraîchement ingérée. */
const NOT_FOUND_HEADERS = { "Cache-Control": "public, max-age=300" };

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string }> }
): Promise<NextResponse> {
  const { publicId } = await params;
  const imageKey = await resolveDealImageKey(publicId);
  if (!imageKey) return notFound();

  const bytes = await fetchDealImageBytes(imageKey);
  if (!bytes) return notFound();

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=86400, s-maxage=2592000" },
  });
}
