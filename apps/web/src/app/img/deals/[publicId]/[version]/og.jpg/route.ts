import { NextResponse } from "next/server";
import { resolveDealImageKey } from "../../../_lib/lookup.js";
import { fetchDealImageBytes } from "../../../../../../lib/dealImageStorage.js";
import { toOgImageJpeg } from "../../../../../../lib/ogImageJpeg.js";

/**
 * GET /img/deals/[publicId]/[version]/og.jpg — variante JPEG dédiée aux
 * aperçus sociaux (og:image). Chemin fixe SANS query string, par
 * construction : incident du 21/07/2026, le crawler Meta a fetché og:image
 * en tronquant `?format=jpeg` (vérifié par curl en prod — ni notre route ni
 * le cache Vercel ne perdaient le paramètre, donc côté crawler) et reçu le
 * WebP servi par défaut sur ce chemin, rejeté à l'affichage. Le WebP des
 * visiteurs du site (apps/web/src/app/deal/[slugAndId]/page.tsx) reste servi
 * par ../../route.ts, inchangé.
 *
 * `[version]` AJOUTÉ le 15/08/2026 — jamais lu, jamais validé, PUREMENT une
 * clé de cache dans le CHEMIN (pas une query string, même leçon du
 * 21/07/2026 ci-dessus appliquée à ce paramètre-ci). Émis par
 * `dealOgImages()` (page.tsx) comme l'epoch de `deals.updated_at` : une
 * image remplacée pose `image_key` ET `updated_at` (mêmes requêtes,
 * `image-depuis-lien`/`image` routes) — l'ancienne URL versionnée devient
 * simplement orpheline (jamais réémise, jamais invalidée activement),
 * pendant que la NOUVELLE URL, jamais vue avant, repart d'un cache MISS
 * propre. Contenu de la réponse TOUJOURS lu depuis l'état actuel de la base,
 * jamais depuis le `version` demandé — une URL versionnée périmée
 * n'existera simplement plus jamais dans le cache une fois expirée, elle ne
 * sert jamais une image obsolète comme si elle était la bonne.
 *
 * Pourquoi maintenant : og.jpg n'est quasi jamais visité par un humain (seul
 * un crawler de partage le demande), donc son cache reste presque toujours
 * froid au moment précis où un partage a lieu — recalculer (Storage +
 * redimensionnement sharp) à CE moment précis est ce qui risquait de
 * dépasser le délai d'un crawler. Un cache long et immuable, PLUS un
 * versionnement fiable, retire ce recalcul du chemin critique dès la
 * première fois qu'une URL donnée a été servie une fois, n'importe où.
 */
export const runtime = "nodejs";

const NOT_FOUND_HEADERS = { "Cache-Control": "public, max-age=300" };
/** Un an, immuable — sûr uniquement PARCE QUE l'URL est versionnée : un
 *  contenu qui changerait sous une URL qui prétend ne jamais changer serait
 *  le pire des deux mondes (stale silencieux). Voir le commentaire
 *  d'en-tête : une image remplacée change `version`, jamais le contenu
 *  derrière une version déjà émise. */
const IMAGE_HEADERS = {
  "Content-Type": "image/jpeg",
  "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
};

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404, headers: NOT_FOUND_HEADERS });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ publicId: string; version: string }> }
): Promise<NextResponse> {
  // `version` délibérément non déstructuré : reçu, jamais lu — voir
  // commentaire d'en-tête, c'est le point.
  const { publicId } = await params;
  const imageKey = await resolveDealImageKey(publicId);
  if (!imageKey) return notFound();

  const bytes = await fetchDealImageBytes(imageKey);
  if (!bytes) return notFound();

  const jpeg = await toOgImageJpeg(bytes);
  return new NextResponse(new Uint8Array(jpeg), { status: 200, headers: IMAGE_HEADERS });
}
