import { entreesHubs, urlsetXml, reponseXml } from "../../lib/sitemap.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** /sitemap-hubs.xml — accueil, catégories et événements indexables, enseignes (lot SEO-3). */
export async function GET(request: Request) {
  const urls = await entreesHubs();
  return reponseXml(
    request,
    urlsetXml(urls),
    urls.map((u) => u.lastmod)
  );
}
