import { CATEGORIES, VILLES } from "@fidwastafid/schemas";
import { PUBLIC_STATUTS } from "./deals.js";

/**
 * Prédicats de filtrage du feed — SOURCE UNIQUE, partagée par
 * `GET /api/v1/deals` (la liste) et `GET /api/v1/deals/facettes` (les
 * compteurs).
 *
 * C'est la garantie structurelle exigée par le lot 7 : « un compteur qui
 * compte autrement que le filtre est un bug ». Tant que les deux endpoints
 * appellent les mêmes fonctions, ils ne PEUVENT pas diverger — la seule
 * alternative (réécrire le WHERE des compteurs à côté) est exactement le
 * mode d'échec à éviter, et il ne lève aucune erreur quand il survient.
 *
 * Toutes les valeurs venant de l'appelant passent par des paramètres liés
 * (`$n`). Les seules chaînes interpolées dans le SQL sont des constantes de
 * ce module (nom de la ville nationale, valeurs de l'enum `type`, alias de
 * table) — jamais une donnée de requête, même validée.
 */

/**
 * Ville conventionnelle d'un deal valable dans tout le pays — ce n'est pas
 * une ville, c'est l'absence de localisation d'une promo nationale
 * (packages/schemas, VILLES[0] : « une promo valable dans tous les magasins
 * d'une enseigne reste "physique" sans ville précise »).
 */
export const VILLE_NATIONALE = VILLES[0];

/** Valeurs de `deals.type` (CONTRAT-V1 §3). */
const TYPE_PHYSIQUE = "physique";
const TYPE_EN_LIGNE = "en_ligne";
const TYPE_LES_DEUX = "les_deux";

/**
 * « Où acheter » — clés acceptées par le paramètre `type`. Lecture en
 * DISPONIBILITÉ, pas en égalité stricte : un deal `les_deux` est achetable
 * en boutique ET en ligne, il appartient donc aux deux ensembles. L'égalité
 * stricte d'avant ce lot le faisait disparaître des deux filtres à la fois.
 * Aucune ligne `les_deux` en base à ce jour — le comportement observable est
 * donc inchangé, mais il cesse d'être faux le jour où le pipeline en produit.
 */
const DISPO_BOUTIQUE = [TYPE_PHYSIQUE, TYPE_LES_DEUX] as const;
const DISPO_EN_LIGNE = [TYPE_EN_LIGNE, TYPE_LES_DEUX] as const;

const DISPONIBILITE: Record<string, readonly string[]> = {
  [TYPE_PHYSIQUE]: DISPO_BOUTIQUE,
  [TYPE_EN_LIGNE]: DISPO_EN_LIGNE,
};

/** Liste SQL de littéraux — construite depuis DISPONIBILITE, jamais depuis l'appelant. */
function listeSql(valeurs: readonly string[]): string {
  return valeurs.map((v) => `'${v}'`).join(", ");
}

export interface FiltresDeals {
  statut: string;
  enseigne: string | null;
  ville: string | null;
  categorie: string | null;
  /** Clé de DISPONIBILITE (`physique` | `en_ligne`), ou null pour « partout ». */
  type: string | null;
  /** Recherche plein texte sur le titre et l'enseigne. */
  q: string | null;
}

function valeurAutorisee(brut: string | null, autorisees: readonly string[]): string | null {
  return brut && autorisees.includes(brut) ? brut : null;
}

/**
 * Lit et NORMALISE les filtres de la query string.
 *
 * Normalisation, pas simple lecture : `ville` est effacée quand « en ligne »
 * est demandé (un deal en ligne n'a pas de ville — la croiser avec une ville
 * ne renverrait rien, ou renverrait autre chose que ce que l'interface
 * annonce). L'interface désactive déjà le sélecteur de ville dans ce cas ;
 * cette normalisation garantit le même résultat pour une URL fabriquée à la
 * main, et surtout garantit que la signature de curseur ci-dessous est
 * identique pour deux URL sémantiquement identiques.
 */
export function lireFiltres(searchParams: URLSearchParams): FiltresDeals {
  const statutBrut = searchParams.get("statut");
  const type = valeurAutorisee(searchParams.get("type"), Object.keys(DISPONIBILITE));
  const q = searchParams.get("q")?.trim();

  return {
    statut: statutBrut && PUBLIC_STATUTS.has(statutBrut) ? statutBrut : "publie",
    enseigne: searchParams.get("enseigne") || null,
    ville: type === TYPE_EN_LIGNE ? null : valeurAutorisee(searchParams.get("ville"), VILLES),
    categorie: valeurAutorisee(searchParams.get("categorie"), CATEGORIES),
    type,
    q: q ? q : null,
  };
}

/**
 * Échappe les jokers LIKE d'une saisie utilisateur. Sans ça, un `%` tapé dans
 * le champ de recherche matche tout et le compteur annonce le catalogue
 * entier — un compteur faux, pas une erreur.
 */
function motifLike(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Accumulateur de paramètres liés. Le tableau est partagé par tous les
 * fragments d'une même requête, d'où la numérotation continue des `$n`.
 */
export interface Lieur {
  values: unknown[];
}

export function lier(l: Lieur, valeur: unknown): string {
  l.values.push(valeur);
  return `$${l.values.length}`;
}

/**
 * Conditions appliquées PARTOUT — liste et compteurs, quelle que soit la
 * dimension comptée. `q` en fait partie : la recherche est un filtre serveur
 * depuis ce lot (avant, elle ne filtrait que les deals déjà chargés côté
 * client, donc elle ne trouvait jamais rien au-delà de la première page).
 */
export function conditionsBase(f: FiltresDeals, l: Lieur, alias = "d"): string[] {
  const conditions = [`${alias}.statut = ${lier(l, f.statut)}`];
  if (f.enseigne) conditions.push(`e.slug = ${lier(l, f.enseigne)}`);
  if (f.q) {
    const motif = lier(l, motifLike(f.q));
    conditions.push(`(${alias}.titre ilike ${motif} escape '\\' or e.nom ilike ${motif} escape '\\' or e.slug ilike ${motif} escape '\\')`);
  }
  return conditions;
}

/**
 * Ville — LA règle métier de ce lot (étape 3).
 *
 * Un deal en ligne est achetable depuis n'importe quelle ville ; un deal
 * `National` couvre tout le pays. Filtrer sur « Casablanca » par une simple
 * égalité retirait donc de la vue des offres réellement disponibles pour
 * l'utilisateur, sans le lui dire. Choisir une ville renvoie désormais :
 * les deals de CETTE ville + les deals nationaux + les deals disponibles
 * en ligne.
 *
 * `cibleSql` est soit un paramètre lié (`$n`, la ville choisie), soit une
 * référence de colonne CHOISIE PAR NOUS (la ville candidate d'un compteur) —
 * jamais une chaîne venant de l'appelant.
 */
export function predicatVille(alias: string, cibleSql: string): string {
  return (
    `(${alias}.ville = ${cibleSql}` +
    ` or ${alias}.ville = '${VILLE_NATIONALE}'` +
    ` or ${alias}.type in (${listeSql(DISPO_EN_LIGNE)}))`
  );
}

/** `true` quand la dimension n'est pas filtrée : neutre dans un `and`. */
export function conditionVille(f: FiltresDeals, l: Lieur, alias = "d"): string {
  if (!f.ville) return "true";
  return predicatVille(alias, lier(l, f.ville));
}

export function conditionCategorie(f: FiltresDeals, l: Lieur, alias = "d"): string {
  if (!f.categorie) return "true";
  return `${alias}.categorie = ${lier(l, f.categorie)}`;
}

export function predicatType(alias: string, cle: string): string {
  const valeurs = DISPONIBILITE[cle];
  return valeurs ? `${alias}.type in (${listeSql(valeurs)})` : "true";
}

export function conditionType(f: FiltresDeals, _l: Lieur, alias = "d"): string {
  return f.type ? predicatType(alias, f.type) : "true";
}

/**
 * Signature stable des filtres, embarquée dans le curseur de pagination
 * (étape 8). Un curseur encode une POSITION dans un jeu de résultats donné ;
 * réinjecté dans un autre jeu, il saute ou duplique des lignes sans lever
 * d'erreur. Le serveur refuse donc tout curseur dont la signature ne
 * correspond pas aux filtres de la requête courante — la garantie ne repose
 * pas sur la discipline du client à remettre le curseur à zéro.
 *
 * Construite depuis les filtres NORMALISÉS : deux URL sémantiquement
 * identiques (`type=en_ligne&ville=Rabat` et `type=en_ligne`) donnent la même
 * signature, donc ne cassent pas une pagination en cours.
 */
export function signatureFiltres(f: FiltresDeals): string {
  return JSON.stringify([f.statut, f.enseigne, f.ville, f.categorie, f.type, f.q]);
}
