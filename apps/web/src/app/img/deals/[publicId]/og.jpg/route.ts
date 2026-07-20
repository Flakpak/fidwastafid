import { NextResponse } from "next/server";
import { resolveDealImageKey } from "../../_lib/lookup.js";
import { fetchDealImageBytes } from "../../../../../lib/dealImageStorage.js";
import { toOgImageJpeg } from "../../../../../lib/ogImageJpeg.js";

/**
 * GET /img/deals/[publicId]/og.jpg — variante JPEG dédiée aux aperçus
 * sociaux (og:image). Chemin fixe SANS query string, par construction :
 * incident du 21/07/2026, le crawler Meta a fetché og:image en tronquant
 * `?format=jpeg` (vérifié par curl en prod — ni notre route ni le cache
 * Vercel ne perdaient le paramètre, donc côté crawler) et reçu le WebP servi
 * par défaut sur ce chemin, rejeté à l'affichage. Le WebP des visiteurs du
 * site (apps/web/src/app/deal/[slugAndId]/page.tsx) reste servi par
 * ../route.ts, inchangé.
 */
export const runtime = "nodejs";

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

  const jpeg = await toOgImageJpeg(bytes);
  return new NextResponse(new Uint8Array(jpeg), {
    status: 200,
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400, s-maxage=2592000" },
  });
}
