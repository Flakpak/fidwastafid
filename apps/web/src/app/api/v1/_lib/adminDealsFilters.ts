import { CATEGORIES } from "@fidwastafid/schemas";
import { REMISE_EXPR } from "./deals.js";
import { SOURCES_ADMIN, SOURCE_INCONNUE_SLUG, sourceAdminParSlug } from "../../../../lib/sourcesAdmin.js";

/**
 * Filtres de la file admin (lot filtres/tri, 12/08/2026) — combinables en
 * AND avec `statut`, jamais côté client (docs/INCIDENTS.md, 04/08/2026:
 * c'est exactement le motif qui a produit une soumission invisible).
 *
 * Une valeur absente ou invalide est IGNORÉE, jamais un 400 — même
 * convention que `lireFiltres()` (feed public, `dealsFilters.ts`) :
 * un filtre mal formé retombe sur « pas de filtre », pas sur une erreur qui
 * casserait un lien déjà partagé si l'enum gagne une valeur plus tard.
 */
export interface FiltresAdmin {
  enseigne: string | null;
  /** Site scrapé, dérivé du domaine de `lien` — jamais une colonne, voir
   *  `lib/sourcesAdmin.ts`. Distinct de `enseigne` : deux sources peuvent
   *  partager la même enseigne (carrefour.ma et bringo.ma, toutes deux
   *  "Carrefour", docs/SPIKE-SOURCES.md §12) sans partager de domaine. */
  source: string | null;
  categorie: string | null;
  remiseMin: number | null;
  remiseMax: number | null;
  prixMin: number | null;
  prixMax: number | null;
  /** Bornes inclusives sur `created_at`, en ISO. `dateMax` est remonté par
   *  l'appelant à la fin de journée (voir `route.ts`) — un input `<input
   *  type=date>` envoie une date sans heure, minuit exclurait la journée
   *  choisie elle-même. */
  dateMin: string | null;
  dateMax: string | null;
}

function nombreOuNull(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateIsoOuNull(v: string | null): string | null {
  if (v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** `inconnue` (lien absent/hors des sources connues) est une valeur de
 *  filtre valide au même titre qu'un slug de `SOURCES_ADMIN` — un slug
 *  invalide ni l'un ni l'autre retombe sur "pas de filtre", jamais une
 *  erreur (même convention que `categorie` ci-dessous). */
function sourceOuNull(v: string | null): string | null {
  if (v === null) return null;
  if (v === SOURCE_INCONNUE_SLUG) return v;
  return sourceAdminParSlug(v) ? v : null;
}

export function lireFiltresAdmin(searchParams: URLSearchParams): FiltresAdmin {
  const categorieBrute = searchParams.get("categorie");
  return {
    enseigne: searchParams.get("enseigne") || null,
    source: sourceOuNull(searchParams.get("source")),
    categorie: categorieBrute && (CATEGORIES as readonly string[]).includes(categorieBrute) ? categorieBrute : null,
    remiseMin: nombreOuNull(searchParams.get("remiseMin")),
    remiseMax: nombreOuNull(searchParams.get("remiseMax")),
    prixMin: nombreOuNull(searchParams.get("prixMin")),
    prixMax: nombreOuNull(searchParams.get("prixMax")),
    dateMin: dateIsoOuNull(searchParams.get("dateMin")),
    dateMax: dateIsoOuNull(searchParams.get("dateMax")),
  };
}

/**
 * Signature stable des filtres — SOURCE UNIQUE avec le curseur de
 * pagination (`_lib/adminDealsCursor.ts`) : un curseur produit sous un jeu
 * de filtres, réinjecté sous un autre, saute ou duplique des lignes en
 * silence. Même mécanique que `signatureFiltres()` (feed public,
 * `dealsFilters.ts`) — le serveur refuse le curseur dont la signature ne
 * correspond pas à la requête courante, la garantie ne dépend donc pas de
 * la discipline du client.
 */
export function signatureFiltresAdmin(f: FiltresAdmin): string {
  return JSON.stringify([
    f.enseigne,
    f.source,
    f.categorie,
    f.remiseMin,
    f.remiseMax,
    f.prixMin,
    f.prixMax,
    f.dateMin,
    f.dateMax,
  ]);
}

/**
 * Conditions SQL + valeurs liées pour les filtres actifs — `alias` porte le
 * numéro de paramètre de départ (1-based), pour s'enchaîner après le/les
 * paramètres déjà posés par l'appelant (`statut`, notamment).
 */
export function conditionsFiltresAdmin(
  f: FiltresAdmin,
  premierIndex: number
): { conditions: string[]; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = premierIndex;

  if (f.enseigne !== null) {
    conditions.push(`e.slug = $${idx}`);
    values.push(f.enseigne);
    idx++;
  }
  if (f.source !== null) {
    if (f.source === SOURCE_INCONNUE_SLUG) {
      // Aucun des domaines connus ne matche — inclut `lien is null`
      // (inwi, catalogues PDF) sans les nommer un par un.
      conditions.push(`(d.lien is null or not (d.lien ilike any($${idx}::text[])))`);
      values.push(SOURCES_ADMIN.map((s) => `%${s.domaine}%`));
      idx++;
    } else {
      // Slug déjà validé par sourceOuNull() — sourceAdminParSlug() ne peut
      // pas renvoyer undefined ici, mais on ne fait jamais confiance
      // silencieusement : un slug qui ne résout à rien n'ajoute aucune
      // condition plutôt que de produire un `ilike '%undefined%'`.
      const source = sourceAdminParSlug(f.source);
      if (source) {
        conditions.push(`d.lien ilike $${idx}`);
        values.push(`%${source.domaine}%`);
        idx++;
      }
    }
  }
  if (f.categorie !== null) {
    conditions.push(`d.categorie = $${idx}`);
    values.push(f.categorie);
    idx++;
  }
  if (f.remiseMin !== null) {
    conditions.push(`(${REMISE_EXPR}) >= $${idx}`);
    values.push(f.remiseMin);
    idx++;
  }
  if (f.remiseMax !== null) {
    conditions.push(`(${REMISE_EXPR}) <= $${idx}`);
    values.push(f.remiseMax);
    idx++;
  }
  if (f.prixMin !== null) {
    conditions.push(`d.prix_promo >= $${idx}`);
    values.push(f.prixMin);
    idx++;
  }
  if (f.prixMax !== null) {
    conditions.push(`d.prix_promo <= $${idx}`);
    values.push(f.prixMax);
    idx++;
  }
  if (f.dateMin !== null) {
    conditions.push(`d.created_at >= $${idx}::timestamptz`);
    values.push(f.dateMin);
    idx++;
  }
  if (f.dateMax !== null) {
    conditions.push(`d.created_at <= $${idx}::timestamptz`);
    values.push(f.dateMax);
    idx++;
  }

  return { conditions, values };
}
