import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@fidwastafid/db";
import { dealUrlSlug } from "@fidwastafid/schemas";
import { SITE_URL } from "./siteUrl.js";
import { estActifSeo } from "../app/api/v1/_lib/deals.js";
import { HUBS_EVENEMENTS } from "../../content/hubs.js";
import { etatEvenement, estCategorieIndexable, REMISE_MIN_EVENEMENT } from "./hubs.js";
import {
  aujourdhuiCasablanca,
  categoriesIndexables,
  compterEnseignes,
  derniereMajEdition,
  derniereMajRemise,
} from "../app/api/v1/_lib/hubs.js";

/**
 * Sitemap découpé (lot SEO-3, CONTRAT-V1 §3 vingt-deuxième amendement) :
 * /sitemap.xml = index → /sitemap-hubs.xml + /sitemap-deals.xml.
 *
 * Règle commune : `lastmod` = vraie modification du contenu (plus récent
 * updated_at des deals que la page affiche), jamais `now()`. Une page sans
 * source de fraîcheur en base n'a pas de lastmod plutôt qu'une date
 * inventée.
 */

export interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq: string;
  priority: string;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function iso(d: string | null | undefined): string | undefined {
  return d ? new Date(d).toISOString() : undefined;
}

function abs(chemin: string): string {
  return new URL(chemin, SITE_URL).toString();
}

export function plusRecent(dates: (string | undefined)[]): string | undefined {
  const valides = dates.filter((d): d is string => Boolean(d));
  if (valides.length === 0) return undefined;
  return new Date(Math.max(...valides.map((d) => Date.parse(d)))).toISOString();
}

export function urlsetXml(urls: UrlEntry[]): string {
  const lignes = urls.map((e) => {
    const lastmod = e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : "";
    return `<url><loc>${xmlEscape(e.loc)}</loc>${lastmod}<changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    lignes.join("\n") +
    "\n</urlset>"
  );
}

export function indexXml(sitemaps: { loc: string; lastmod?: string }[]): string {
  const lignes = sitemaps.map((s) => {
    const lastmod = s.lastmod ? `<lastmod>${s.lastmod}</lastmod>` : "";
    return `<sitemap><loc>${xmlEscape(s.loc)}</loc>${lastmod}</sitemap>`;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    lignes.join("\n") +
    "\n</sitemapindex>"
  );
}

/**
 * Réponse XML avec validateurs réels (repris de l'ancienne route du
 * 12/08/2026) : ETag = hash du contenu, Last-Modified = plus récent lastmod
 * du fichier, jamais `now()` — sauf fichier sans aucune date.
 */
export function reponseXml(request: Request, body: string, lastmods: (string | undefined)[]): NextResponse {
  const etag = `"${createHash("sha1").update(body).digest("hex")}"`;
  const dernier = plusRecent(lastmods);
  const headers = {
    "Content-Type": "application/xml; charset=utf-8",
    "Last-Modified": (dernier ? new Date(dernier) : new Date()).toUTCString(),
    ETag: etag,
    "Cache-Control": "public, max-age=0, must-revalidate",
  };
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(body, { status: 200, headers });
}

interface DealRow {
  public_id: string;
  titre: string;
  updated_at: string;
  statut: string;
  protege: boolean;
}

/**
 * Fiches deal — règles INCHANGÉES par rapport à l'ancien sitemap unique :
 * statuts publics (`publie` + `expire`), filtrés par `estActifSeo()`, SOURCE
 * UNIQUE partagée avec la balise robots de la fiche (CONTRAT-V1 §1,
 * dix-huitième amendement conscient).
 */
export async function entreesDeals(): Promise<UrlEntry[]> {
  const bruts = await query<DealRow>(
    `select d.public_id, d.titre, d.updated_at, d.statut, dp.protege
       from deals d
       join deals_protection dp on dp.public_id = d.public_id
      where d.supprime_le is null
        and d.statut = any(array['publie', 'expire'])
      order by d.updated_at desc`
  );
  return bruts
    .filter((d) => estActifSeo(d.statut, d.protege))
    .map((d) => ({
      loc: abs(`/deal/${dealUrlSlug(d.titre, d.public_id)}`),
      lastmod: iso(d.updated_at),
      changefreq: "daily",
      priority: "0.7",
    }));
}

/**
 * Hubs : accueil, catégories indexables, événements indexables, enseignes,
 * et les trois pages de contenu statique (déjà présentes dans l'ancien
 * sitemap — sans source de fraîcheur, donc sans lastmod).
 */
export async function entreesHubs(): Promise<UrlEntry[]> {
  const [accueil, indexables, aujourdhui, enseignes] = await Promise.all([
    // Accueil : son feed par défaut liste les deals `publie` — même signal
    // que l'ancien sitemap (plus récent updated_at d'un deal publié).
    query<{ derniere_maj: string | null }>(
      "select max(updated_at) as derniere_maj from deals where statut = 'publie' and supprime_le is null"
    ),
    categoriesIndexables(),
    aujourdhuiCasablanca(),
    compterEnseignes(),
  ]);

  const evenements: UrlEntry[] = [];
  for (const evenement of HUBS_EVENEMENTS) {
    const { edition, indexable } = etatEvenement(evenement, aujourdhui);
    if (!indexable) continue;
    // Même jeu de deals que la page : édition en cours → deals publiés dans
    // la fenêtre ; hors saison → meilleures remises du moment.
    const derniere = edition
      ? await derniereMajEdition(edition, REMISE_MIN_EVENEMENT)
      : await derniereMajRemise();
    evenements.push({
      loc: abs(`/bons-plans/${evenement.slug}`),
      lastmod: iso(derniere),
      changefreq: "daily",
      priority: edition ? "0.9" : "0.5",
    });
  }

  return [
    { loc: SITE_URL, lastmod: iso(accueil[0]?.derniere_maj), changefreq: "hourly", priority: "1" },
    ...indexables.map((c) => ({
      loc: abs(`/categorie/${c.hub.slug}`),
      lastmod: iso(c.derniereMaj),
      changefreq: "daily",
      priority: "0.8",
    })),
    ...evenements,
    // Enseignes : même seuil que les catégories (lot SEO-3) — sous le seuil,
    // la page est `noindex, follow` et n'a rien à faire dans le sitemap.
    ...enseignes.filter((e) => estCategorieIndexable(e.nombre)).map((e) => ({
      loc: abs(`/enseigne/${e.slug}`),
      lastmod: iso(e.derniereMaj),
      changefreq: "weekly",
      priority: "0.5",
    })),
    { loc: abs("/concept"), changefreq: "monthly", priority: "0.3" },
    { loc: abs("/confidentialite"), changefreq: "yearly", priority: "0.2" },
    { loc: abs("/contact"), changefreq: "yearly", priority: "0.2" },
  ];
}

export const CHEMIN_SITEMAP_HUBS = "/sitemap-hubs.xml";
export const CHEMIN_SITEMAP_DEALS = "/sitemap-deals.xml";
