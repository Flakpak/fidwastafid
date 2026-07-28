import { CATEGORIES, VILLES } from "@fidwastafid/schemas";
import {
  conditionCategorie,
  conditionType,
  conditionVille,
  conditionsBase,
  lier,
  predicatVille,
  type FiltresDeals,
  type Lieur,
} from "./dealsFilters.js";

/**
 * Compteurs CONTEXTUELS du feed (lot 7, étape 5).
 *
 * Chaque dimension est comptée en appliquant les AUTRES filtres actifs, mais
 * pas le sien : le compteur d'une catégorie répond « combien de deals si je
 * choisis cette catégorie, à ville et disponibilité constantes » — la seule
 * question que se pose l'utilisateur devant la liste. Un total figé
 * présenté comme contextuel serait un mensonge d'interface.
 *
 * Les prédicats viennent tous de `dealsFilters.ts`, partagés avec la liste :
 * le compteur ne peut pas compter autrement que ce que le filtre renverra.
 *
 * Coût mesuré (prod, EXPLAIN ANALYZE) : 2,4 ms sur les 88 deals publiés
 * (Index Scan `deals_feed_idx`, 73 buffers) et 22 ms sur les 1 071 lignes de
 * la table entière, soit ~12x le volume publié actuel. Une seule requête,
 * un seul aller-retour. Aucun repli (compteurs partiels, cache) n'est
 * justifié à cette échelle ; le point de bascule à surveiller est le passage
 * en Seq Scan, qu'un index `(statut, ville, categorie, type)` repousserait.
 */

export interface Facette {
  valeur: string;
  n: number;
}

export interface Facettes {
  /** Nombre de deals que la liste renverra avec CES filtres, exactement.
   *  Seul nombre encore AFFICHÉ par l'interface. */
  total: number;
  /** Par dimension : plus affichés depuis le lot 7 bis (aucune valeur d'usage
   *  constatée), mais toujours calculés — ils servent à GRISER les options
   *  sans deal, pour qu'on ne puisse pas s'enfermer dans un filtre vide. */
  categories: Facette[];
  villes: Facette[];
}

export interface FacetteRow {
  dim: string;
  valeur: string;
  n: number;
}

/**
 * Une seule requête pour les trois agrégats.
 *
 * `unnest(... ) with ordinality` sur les enums plutôt qu'un `group by` sur
 * les lignes : une valeur sans aucun deal doit ressortir à 0, pas
 * disparaître — l'interface la grise et la rend non sélectionnable
 * (« on apprend qu'elle existe sans pouvoir s'y enfermer »). Un `group by`
 * seul ne produit pas de ligne pour l'absence.
 *
 * Les villes se comptent par jointure croisée (9 valeurs x N lignes) et non
 * par regroupement : la règle « ville + national + en ligne » fait qu'un même
 * deal compte dans PLUSIEURS villes, ce qu'un `group by d.ville` ne sait pas
 * exprimer.
 */
export function requeteFacettes(f: FiltresDeals): { text: string; values: unknown[] } {
  const l: Lieur = { values: [] };

  // Fragments calculés UNE fois puis réutilisés : le même `$n` peut apparaître
  // à plusieurs endroits du texte, Postgres résout par indice et non par
  // position, et une seule liaison évite de dupliquer les valeurs.
  const base = conditionsBase(f, l, "d").join(" and ");
  const okVille = conditionVille(f, l, "b");
  const okCategorie = conditionCategorie(f, l, "b");
  const okType = conditionType(f, l, "b");
  const pCategories = lier(l, [...CATEGORIES]);
  const pVilles = lier(l, [...VILLES]);

  // `b.categorie is not null` = « une ligne a réellement été jointe »
  // (deals.categorie est NOT NULL) : sans ce garde, un left join sans
  // correspondance ferait compter 1 au lieu de 0.
  const text = `
    with base as (
      select d.ville, d.categorie, d.type
      from deals d
      left join enseignes e on e.id = d.enseigne_id
      where ${base}
    ),
    cats as (
      select 'categorie'::text as dim, c.valeur, c.ord,
             count(*) filter (where b.categorie is not null and ${okVille} and ${okType})::int as n
      from unnest(${pCategories}::text[]) with ordinality as c(valeur, ord)
      left join base b on b.categorie = c.valeur
      group by c.valeur, c.ord
    ),
    vls as (
      select 'ville'::text as dim, v.valeur, v.ord,
             count(*) filter (
               where b.categorie is not null
                 and ${predicatVille("b", "v.valeur")}
                 and ${okCategorie}
                 and ${okType}
             )::int as n
      from unnest(${pVilles}::text[]) with ordinality as v(valeur, ord)
      left join base b on true
      group by v.valeur, v.ord
    ),
    tot as (
      select 'total'::text as dim, ''::text as valeur, 0::bigint as ord, count(*)::int as n
      from base b
      where ${okVille} and ${okCategorie} and ${okType}
    )
    select dim, valeur, n
    from (select * from cats union all select * from vls union all select * from tot) x
    order by dim, ord
  `;

  return { text, values: l.values };
}

/** Regroupe les lignes plates de `requeteFacettes` en réponse d'API. */
export function assemblerFacettes(rows: FacetteRow[]): Facettes {
  const facettes: Facettes = { total: 0, categories: [], villes: [] };
  for (const row of rows) {
    if (row.dim === "total") facettes.total = row.n;
    else if (row.dim === "categorie") facettes.categories.push({ valeur: row.valeur, n: row.n });
    else if (row.dim === "ville") facettes.villes.push({ valeur: row.valeur, n: row.n });
  }
  return facettes;
}
