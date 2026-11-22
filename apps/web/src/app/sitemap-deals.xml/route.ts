import { entreesDeals, urlsetXml, reponseXml } from "../../lib/sitemap.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /sitemap-deals.xml — fiches deal, règles de l'ancien sitemap unique inchangées (lot SEO-3). */
export async function GET(request: Request) {
  const urls = await entreesDeals();
  return reponseXml(
    request,
    urlsetXml(urls),
    urls.map((u) => u.lastmod)
  );
}
