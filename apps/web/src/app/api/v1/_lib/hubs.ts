import { cache } from "react";
import { query } from "@fidwastafid/db";
import type { Deal } from "@fidwastafid/schemas";
import { DEAL_SELECT, DEAL_FROM, toDeal, type DealRow } from "./deals.js";
import type { HubCategorie } from "../../../../../content/hubs.js";
import { hubParCategorie, estCategorieIndexable } from "../../../../lib/hubs.js";

/**
 * Accès base des pages hub (lot SEO-3). Règles pures : src/lib/hubs.ts.
 *
 * « Deal publié actif » : `publie`, non supprimé, et date de fin absente ou
 * pas encore passée au jour de Casablanca. Le jour est calculé par Postgres,
 * jamais par Node (PR #190 : les deux ne s'accordent pas sur
 * Africa/Casablanca). `expirer-publies.mjs` passe chaque matin en `expire`
 * les deals échus ; cette condition couvre l'intervalle entre l'échéance et
 * ce passage.
 */
export const CONDITION_ACTIF = `
  d.statut = 'publie'
  and d.supprime_le is null
  and (d.date_fin is null or d.date_fin >= (now() at time zone 'Africa/Casablanca')::date)
`;

/** Remise en fraction (0,35 = −35 %) ; null sans prix d'origine exploitable. */
const REMISE_SQL = `case when d.prix_normal > d.prix_promo and d.prix_normal > 0
  then 1 - d.prix_promo / d.prix_normal end`;

const ORDRE_REMISE = `order by ${REMISE_SQL} desc nulls last, d.score desc, d.created_at desc`;

/** Jour courant à Casablanca (AAAA-MM-JJ), calculé par Postgres. */
export const aujourdhuiCasablanca = cache(async (): Promise<string> => {
  const rows = await query<{ jour: string }>("select (now() at time zone 'Africa/Casablanca')::date::text as jour");
  const jour = rows[0]?.jour;
  if (!jour) throw new Error("aujourdhuiCasablanca : Postgres n'a renvoyé aucune ligne.");
  return jour;
});

export interface CompteCategorie {
  categorie: string;
  nombre: number;
  /** Plus récent updated_at des deals actifs de la catégorie. */
  derniereMaj: string;
}

/** Deals publiés actifs par catégorie. Mis en cache par requête (accueil + pied de page). */
export const compterCategories = cache(async (): Promise<CompteCategorie[]> => {
  const rows = await query<{ categorie: string; nombre: number; derniere_maj: string }>(
    `select d.categorie, count(*)::int as nombre, max(d.updated_at) as derniere_maj
       from deals d
      where ${CONDITION_ACTIF}
      group by d.categorie`
  );
  return rows.map((r) => ({ categorie: r.categorie, nombre: r.nombre, derniereMaj: r.derniere_maj }));
});

export interface CategorieIndexable {
  hub: HubCategorie;
  nombre: number;
  derniereMaj: string;
}

/**
 * Catégories ayant une page ET au moins SEUIL_INDEXATION_CATEGORIE deals
 * actifs, par nombre décroissant. Source unique du maillage (accueil, pied
 * de page, pages hub) et du sitemap des hubs : un lien interne ou une URL
 * de sitemap ne pointe jamais vers une page `noindex`.
 */
export const categoriesIndexables = cache(async (): Promise<CategorieIndexable[]> => {
  const comptes = await compterCategories();
  const resultat: CategorieIndexable[] = [];
  for (const c of comptes) {
    const hub = hubParCategorie(c.categorie);
    if (hub && estCategorieIndexable(c.nombre)) resultat.push({ hub, nombre: c.nombre, derniereMaj: c.derniereMaj });
  }
  return resultat.sort((a, b) => b.nombre - a.nombre || a.hub.slug.localeCompare(b.hub.slug));
});

export async function fetchDealsCategorie(categorie: string, limite: number): Promise<Deal[]> {
  const rows = await query<DealRow>(
    `select ${DEAL_SELECT} ${DEAL_FROM}
      where ${CONDITION_ACTIF} and d.categorie = $1
      ${ORDRE_REMISE}
      limit $2`,
    [categorie, limite]
  );
  return rows.map(toDeal);
}

/**
 * Meilleures remises du moment, toutes catégories. `remiseMin` (fraction)
 * exclut les deals sans prix d'origine : « une remise sans prix d'origine ne
 * prouve rien » (texte de la page Black Friday).
 */
export async function fetchMeilleuresRemises(limite: number, remiseMin?: number): Promise<Deal[]> {
  const filtre = remiseMin === undefined ? "" : `and ${REMISE_SQL} >= $2`;
  const params: unknown[] = [limite];
  if (remiseMin !== undefined) params.push(remiseMin);
  const rows = await query<DealRow>(
    `select ${DEAL_SELECT} ${DEAL_FROM}
      where ${CONDITION_ACTIF} ${filtre}
      ${ORDRE_REMISE}
      limit $1`,
    params
  );
  return rows.map(toDeal);
}

/**
 * Date de première publication d'un deal : la plus ancienne trace d'audit
 * d'une transition vers `publie` (même lecture que la vue `deals_protection`,
 * migration 0015), à défaut `created_at`. `journal_audit` est la seule
 * source qui date la publication : `created_at` date l'insertion (souvent
 * en `auto_draft` par le pipeline, publiée des jours plus tard) et
 * `updated_at` bouge à chaque modification. Mesuré le 22/11/2026 : les 292
 * deals publiés ont tous cette trace ; le repli ne sert qu'aux cas futurs.
 */
const PREMIERE_PUBLICATION_SQL = `coalesce(
  (select min(ja.created_at) from journal_audit ja
    where ja.cible_type = 'deal' and ja.cible_id = d.public_id
      and coalesce((ja.details -> 'statut') ->> 'apres', ja.details ->> 'apres') = 'publie'),
  d.created_at)`;

/** Condition « publié pour la première fois dans la fenêtre » (jours de Casablanca, bornes incluses). */
function dansFenetre(paramDebut: string, paramFin: string): string {
  return `(${PREMIERE_PUBLICATION_SQL} at time zone 'Africa/Casablanca')::date between ${paramDebut}::date and ${paramFin}::date`;
}

/**
 * Deals d'une édition d'événement : actifs, publiés pour la première fois
 * dans la fenêtre [debut, fin], remise ≥ remiseMin, triés par remise. Jamais
 * complétés par des deals hors fenêtre.
 */
export async function fetchDealsEdition(
  fenetre: { debut: string; fin: string },
  remiseMin: number,
  limite: number
): Promise<Deal[]> {
  const rows = await query<DealRow>(
    `select ${DEAL_SELECT} ${DEAL_FROM}
      where ${CONDITION_ACTIF}
        and ${dansFenetre("$2", "$3")}
        and ${REMISE_SQL} >= $4
      ${ORDRE_REMISE}
      limit $1`,
    [limite, fenetre.debut, fenetre.fin, remiseMin]
  );
  return rows.map(toDeal);
}

/** lastmod du hub d'une édition en cours : mêmes deals que la page. */
export async function derniereMajEdition(fenetre: { debut: string; fin: string }, remiseMin: number): Promise<string | null> {
  const rows = await query<{ derniere_maj: string | null }>(
    `select max(d.updated_at) as derniere_maj from deals d
      where ${CONDITION_ACTIF} and ${dansFenetre("$1", "$2")} and ${REMISE_SQL} >= $3`,
    [fenetre.debut, fenetre.fin, remiseMin]
  );
  return rows[0]?.derniere_maj ?? null;
}

export interface CompteEnseigne {
  slug: string;
  nombre: number;
  derniereMaj: string | null;
}

/** Deals publiés actifs par enseigne (toutes les enseignes, 0 compris). */
export const compterEnseignes = cache(async (): Promise<CompteEnseigne[]> => {
  const rows = await query<{ slug: string; nombre: number; derniere_maj: string | null }>(
    `select e.slug, count(d.id)::int as nombre, max(d.updated_at) as derniere_maj
       from enseignes e
       left join deals d on d.enseigne_id = e.id and ${CONDITION_ACTIF}
      group by e.slug`
  );
  return rows.map((r) => ({ slug: r.slug, nombre: r.nombre, derniereMaj: r.derniere_maj }));
});

/** Plus récent updated_at des deals actifs au-dessus d'une remise (lastmod d'un hub événement). */
export async function derniereMajRemise(remiseMin?: number): Promise<string | null> {
  const filtre = remiseMin === undefined ? "" : `and ${REMISE_SQL} >= $1`;
  const rows = await query<{ derniere_maj: string | null }>(
    `select max(d.updated_at) as derniere_maj from deals d where ${CONDITION_ACTIF} ${filtre}`,
    remiseMin === undefined ? [] : [remiseMin]
  );
  return rows[0]?.derniere_maj ?? null;
}
