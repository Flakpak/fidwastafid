import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { dealUrlSlug } from "@fidwastafid/schemas";
import { SITE_URL } from "../../lib/siteUrl.js";

export const runtime = "nodejs";

/**
 * Route manuelle (pas la convention `sitemap.ts`, remplacée le 12/08/2026) :
 * la convention Next.js ne donne AUCUNE prise sur les en-têtes HTTP de la
 * réponse — `Last-Modified`/`ETag` étaient donc absents (constat du
 * 12/08/2026), sans validateur Google doit retélécharger tout le fichier
 * pour savoir s'il a changé, au lieu d'un 304 bon marché.
 *
 * Seuls les statuts publics (CONTRAT-V1 §1 : `publie` + `expire`) sont
 * exposés — un deal expiré reste un actif SEO, il doit rester dans le
 * sitemap.
 *
 * MAIS « expire » seul ne suffit pas : 681 des 802 URLs de deals que
 * l'ancien fichier déclarait n'avaient JAMAIS été publiées — des
 * `auto_draft` jamais validés, expirés automatiquement après 14 jours
 * (expirer-auto-draft.mjs), sans jamais passer par un statut `publie`. La
 * garantie « URL vivante à vie » du §1 protège un actif SEO réel (une page
 * publiée, potentiellement partagée) — pas un brouillon jamais montré à
 * personne. Réutilise `deals_protection` (migration 0015, lot 3) :
 * `protege` y est vrai dès qu'une trace d'audit prouve une publication
 * (transition explicite vers `publie`, ou une diffusion communautaire —
 * preuve indépendante) ; un `expire` sans AUCUNE de ces traces n'a jamais
 * été publié, il sort du sitemap. Un `publie` reste toujours inclus (il
 * l'est par construction : passer en `publie` EST la transition détectée).
 *
 * Mesuré en production avant ce correctif (lecture seule, 12/08/2026) :
 * 681 `expire` protégés = 0, 681 non protégés = 681 — tous les `expire`
 * qui existent aujourd'hui sont ce cas. 121 `publie`, tous protégés.
 */
export const dynamic = "force-dynamic";

interface DealRow {
  public_id: string;
  titre: string;
  updated_at: string;
  statut: string;
}

interface EnseigneRow {
  slug: string;
  derniere_maj: string | null;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
}

function urlXml(e: UrlEntry): string {
  const lastmod = e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : "";
  return `<url><loc>${xmlEscape(e.loc)}</loc>${lastmod}<changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`;
}

export async function GET(request: Request): Promise<NextResponse> {
  const [deals, enseignes] = await Promise.all([
    query<DealRow>(
      `select d.public_id, d.titre, d.updated_at, d.statut
         from deals d
         join deals_protection dp on dp.public_id = d.public_id
        where d.supprime_le is null
          and (d.statut = 'publie' or (d.statut = 'expire' and dp.protege))
        order by d.updated_at desc`
    ),
    // `derniere_maj` = plus récent updated_at des deals de CETTE enseigne —
    // signal de fraîcheur réel (le contenu affiché sur /enseigne/[slug]
    // change avec ses deals), jamais une date inventée. `null` si l'enseigne
    // n'a aucun deal public : lastmod omis pour cette entrée plutôt qu'une
    // valeur fabriquée (même discipline que les 3 pages de contenu statique
    // ci-dessous, qui n'ont aucune source de fraîcheur en base).
    query<EnseigneRow>(
      `select e.slug, max(d.updated_at) as derniere_maj
         from enseignes e
         left join deals d on d.enseigne_id = e.id and d.supprime_le is null and d.statut = 'publie'
        group by e.slug`
    ),
  ]);

  // Accueil : pas de ligne dédiée en base, mais son contenu EST le plus
  // récent des deals PUBLIÉS qu'il liste (le feed par défaut ne montre que
  // `publie`, jamais `expire`, même protégé) — signal réel, pas une date
  // arbitraire. `deals` est trié par `updated_at desc`, donc le premier
  // `publie` rencontré est le bon. `null` seulement si la base est vide,
  // cas où l'accueil n'a de toute façon rien de daté à annoncer.
  const dernierDealPublie = deals.find((d) => d.statut === "publie")?.updated_at ?? null;

  const urls: UrlEntry[] = [
    {
      loc: SITE_URL,
      lastmod: dernierDealPublie ? new Date(dernierDealPublie).toISOString() : undefined,
      changefreq: "hourly",
      priority: "1",
    },
    { loc: new URL("/concept", SITE_URL).toString(), changefreq: "monthly", priority: "0.3" },
    { loc: new URL("/confidentialite", SITE_URL).toString(), changefreq: "yearly", priority: "0.2" },
    { loc: new URL("/contact", SITE_URL).toString(), changefreq: "yearly", priority: "0.2" },
    ...deals.map((d) => ({
      loc: new URL(`/deal/${dealUrlSlug(d.titre, d.public_id)}`, SITE_URL).toString(),
      lastmod: new Date(d.updated_at).toISOString(),
      changefreq: "daily",
      priority: "0.7",
    })),
    ...enseignes.map((e) => ({
      loc: new URL(`/enseigne/${e.slug}`, SITE_URL).toString(),
      lastmod: e.derniere_maj ? new Date(e.derniere_maj).toISOString() : undefined,
      changefreq: "weekly",
      priority: "0.5",
    })),
  ];

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(urlXml).join("\n") +
    "\n</urlset>";

  // Validateur réel : hash du contenu généré. Identique tant que rien n'a
  // changé (aucun deal/enseigne touché) → 304 sans retransmettre 165 Ko,
  // et un signal HONNÊTE à Google (contrairement à un Last-Modified
  // recalculé sur `now()` à chaque requête, qui mentirait « vient de
  // changer » même quand rien n'a bougé).
  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;

  // Dernière modification RÉELLE = le plus récent `lastmod` du fichier
  // (deals + enseignes confondus), jamais `now()` — même principe que
  // l'ETag : un signal qui ment (« modifié maintenant ») n'est pas un
  // signal, c'est un repli silencieux de plus (docs/INCIDENTS.md).
  const dates = urls.map((u) => u.lastmod).filter((d): d is string => Boolean(d));
  const lastModified = dates.length > 0 ? new Date(Math.max(...dates.map((d) => Date.parse(d)))) : new Date();

  const headers = {
    "Content-Type": "application/xml; charset=utf-8",
    "Last-Modified": lastModified.toUTCString(),
    ETag: etag,
    "Cache-Control": "public, max-age=0, must-revalidate",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }

  return new NextResponse(body, { status: 200, headers });
}
