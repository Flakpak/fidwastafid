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

/** Plus récent updated_at des deals actifs au-dessus d'une remise (lastmod d'un hub événement). */
export async function derniereMajRemise(remiseMin?: number): Promise<string | null> {
  const filtre = remiseMin === undefined ? "" : `and ${REMISE_SQL} >= $1`;
  const rows = await query<{ derniere_maj: string | null }>(
    `select max(d.updated_at) as derniere_maj from deals d where ${CONDITION_ACTIF} ${filtre}`,
    remiseMin === undefined ? [] : [remiseMin]
  );
  return rows[0]?.derniere_maj ?? null;
}
