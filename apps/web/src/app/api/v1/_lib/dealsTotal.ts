import {
  conditionCategorie,
  conditionType,
  conditionVille,
  conditionsBase,
  type FiltresDeals,
  type Lieur,
} from "./dealsFilters.js";

/**
 * Nombre de deals que `GET /api/v1/deals` renverra pour un jeu de filtres
 * donné — SANS pagination.
 *
 * Remplace l'agrégation croisée par dimension du lot 7. Celle-ci alimentait
 * deux choses : les compteurs affichés par option, et le grisé des options
 * sans deal. Les deux ont été retirés — les compteurs faute de valeur d'usage,
 * le grisé parce que sept catégories pâles sur douze, sans un chiffre pour les
 * expliquer, donnaient une colonne à moitié morte. Il ne restait donc plus
 * qu'un `count(*)`, et une agrégation croisée conservée pour un seul scalaire
 * aurait été du code entretenu pour rien.
 *
 * Ce total reste indispensable : sans lui, un filtre qui ne renvoie rien est
 * indiscernable d'un site en panne.
 *
 * Les prédicats viennent de `dealsFilters.ts`, partagés avec la liste : le
 * nombre annoncé ne peut pas différer de ce qui s'affichera.
 */
export interface TotalDeals {
  total: number;
}

export function requeteTotal(f: FiltresDeals): { text: string; values: unknown[] } {
  const l: Lieur = { values: [] };
  const conditions = [
    ...conditionsBase(f, l),
    conditionVille(f, l),
    conditionCategorie(f, l),
    conditionType(f, l),
  ];

  return {
    text: `
      select count(*)::int as total
      from deals d
      left join enseignes e on e.id = d.enseigne_id
      where ${conditions.join(" and ")}
    `,
    values: l.values,
  };
}
