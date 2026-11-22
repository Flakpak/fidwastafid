import { SITE_URL } from "../../lib/siteUrl.js";
import {
  entreesHubs,
  entreesDeals,
  indexXml,
  plusRecent,
  reponseXml,
  CHEMIN_SITEMAP_HUBS,
  CHEMIN_SITEMAP_DEALS,
} from "../../lib/sitemap.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /sitemap.xml — INDEX depuis le lot SEO-3 (CONTRAT-V1 §3, vingt-deuxième
 * amendement) : renvoie vers /sitemap-hubs.xml et /sitemap-deals.xml.
 * robots.txt pointe toujours ici. Route manuelle (pas la convention Next.js)
 * pour garder la main sur ETag/Last-Modified — voir src/lib/sitemap.ts.
 *
 * lastmod de chaque sous-sitemap = plus récent lastmod de ses URLs.
 */
export async function GET(request: Request) {
  const [hubs, deals] = await Promise.all([entreesHubs(), entreesDeals()]);
  const sitemaps = [
    { loc: new URL(CHEMIN_SITEMAP_HUBS, SITE_URL).toString(), lastmod: plusRecent(hubs.map((u) => u.lastmod)) },
    { loc: new URL(CHEMIN_SITEMAP_DEALS, SITE_URL).toString(), lastmod: plusRecent(deals.map((u) => u.lastmod)) },
  ];
  return reponseXml(
    request,
    indexXml(sitemaps),
    sitemaps.map((s) => s.lastmod)
  );
}
