import { CATEGORIES, VILLES } from "@fidwastafid/schemas";

/**
 * État des filtres du feed — pur, sans DOM ni React, pour être testable
 * hors navigateur (même contrainte que feedPagination.ts : le harnais
 * `pnpm test` est hors ligne).
 *
 * Une seule représentation sert à trois usages : l'URL (partage et retour
 * arrière), la query string de l'API, et l'affichage. Les trois ne peuvent
 * donc pas se contredire.
 */

export type TypeAchat = "" | "physique" | "en_ligne";
export type TriFeed = "tendance" | "score" | "recent";

export interface EtatFiltres {
  /** "" = aucune valeur choisie (état neutre), jamais "tous". */
  categorie: string;
  ville: string;
  type: TypeAchat;
  tri: TriFeed;
  q: string;
}

export const FILTRES_PAR_DEFAUT: EtatFiltres = {
  categorie: "",
  ville: "",
  type: "",
  tri: "tendance",
  q: "",
};

/**
 * Les deux dimensions filtrables, et leurs deux libellés.
 *
 * `nom` titre la SECTION (colonne desktop, feuille mobile) : c'est le nom de
 * la dimension, pas une valeur. `neutre` est le libellé de l'OPTION qui
 * n'applique aucun filtre — il lui faut une formulation qui se choisit : on
 * ne clique pas sur « Catégorie » pour tout afficher, on clique sur
 * « Toutes les catégories ».
 */
export const DIMENSIONS = {
  categorie: { nom: "Catégorie", neutre: "Toutes les catégories", valeurs: CATEGORIES as readonly string[] },
  ville: { nom: "Ville", neutre: "Toutes les villes", valeurs: VILLES as readonly string[] },
} as const;

/** « Où acheter » — trois options exclusives, dont l'absence de filtre. */
export const OU_ACHETER: { value: TypeAchat; label: string }[] = [
  { value: "", label: "Partout" },
  { value: "physique", label: "En boutique" },
  { value: "en_ligne", label: "En ligne" },
];

/** Tri — DÉPLACÉ ici depuis Feed.tsx, libellés inchangés. Ce n'est pas un
 *  filtre : il ne retire aucun deal, il en change l'ordre. D'où sa section
 *  distincte dans la feuille et sa place à part sur la barre desktop. */
export const TRIS: { value: TriFeed; label: string }[] = [
  { value: "tendance", label: "Tendances" },
  { value: "score", label: "Les plus chauds" },
  { value: "recent", label: "Les plus récents" },
];

/**
 * Un deal en ligne est disponible partout : croiser « en ligne » avec une
 * ville n'a pas de sens. Le sélecteur de ville est donc désactivé dans ce
 * cas — avec une raison lisible plutôt qu'un contrôle actif sans effet — et
 * la valeur est effacée, ici comme côté serveur (`lireFiltres`).
 */
export function villeSansObjet(e: Pick<EtatFiltres, "type">): boolean {
  return e.type === "en_ligne";
}

export const RAISON_VILLE_SANS_OBJET = "Un deal en ligne est disponible partout, quelle que soit la ville.";

/** Compteur de résultats — repli de focus à la fermeture de la feuille quand
 *  le déclencheur n'est plus focalisable (voir FeuilleFiltres). */
export const ANCRE_RESULTATS = "resultats-feed";

export function normaliserFiltres(e: EtatFiltres): EtatFiltres {
  return villeSansObjet(e) && e.ville ? { ...e, ville: "" } : e;
}

function valeurAutorisee(brut: string | null, autorisees: readonly string[]): string {
  return brut && autorisees.includes(brut) ? brut : "";
}

export function lireFiltresUrl(params: URLSearchParams): EtatFiltres {
  const type = valeurAutorisee(params.get("type"), ["physique", "en_ligne"]) as TypeAchat;
  const tri = valeurAutorisee(params.get("tri"), ["score", "recent"]) as TriFeed;
  return normaliserFiltres({
    categorie: valeurAutorisee(params.get("categorie"), DIMENSIONS.categorie.valeurs),
    ville: valeurAutorisee(params.get("ville"), DIMENSIONS.ville.valeurs),
    type,
    tri: tri || "tendance",
    q: params.get("q")?.trim() ?? "",
  });
}

/**
 * Query string canonique — seules les valeurs non par défaut y figurent,
 * pour que l'URL par défaut reste `/` et qu'un même état produise toujours
 * la même URL (sans quoi l'historique se remplirait d'entrées équivalentes).
 */
export function ecrireFiltresUrl(e: EtatFiltres): string {
  const n = normaliserFiltres(e);
  const params = new URLSearchParams();
  if (n.categorie) params.set("categorie", n.categorie);
  if (n.ville) params.set("ville", n.ville);
  if (n.type) params.set("type", n.type);
  if (n.tri !== FILTRES_PAR_DEFAUT.tri) params.set("tri", n.tri);
  if (n.q) params.set("q", n.q);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Nombre de FILTRES actifs — pastille du bouton réglages. Le tri en est
 * exclu (il ne retire rien), la recherche aussi : elle a son propre champ
 * visible sur la barre, la compter ici la ferait apparaître deux fois.
 */
export function nbFiltresActifs(e: EtatFiltres): number {
  const n = normaliserFiltres(e);
  return (n.categorie ? 1 : 0) + (n.ville ? 1 : 0) + (n.type ? 1 : 0);
}

export function filtresParDefaut(e: EtatFiltres): boolean {
  return nbFiltresActifs(e) === 0 && !e.q && e.tri === FILTRES_PAR_DEFAUT.tri;
}

/**
 * Rappel en clair des filtres actifs (étape 6) : sans lui, un feed filtré à
 * zéro est indiscernable d'un site en panne. Le tri n'y figure pas — il ne
 * retire aucun résultat, donc il n'explique jamais une liste vide.
 */
export function resumeFiltres(e: EtatFiltres): string[] {
  const n = normaliserFiltres(e);
  const parts: string[] = [];
  if (n.categorie) parts.push(n.categorie);
  if (n.ville) parts.push(n.ville);
  if (n.type) parts.push(OU_ACHETER.find((o) => o.value === n.type)?.label ?? n.type);
  if (n.q) parts.push(`« ${n.q} »`);
  return parts;
}

/**
 * Une option de la feuille est grisée et non sélectionnable quand elle ne
 * ramènerait aucun deal — on apprend qu'elle existe sans pouvoir s'y
 * enfermer. Deux exceptions :
 * - le choix COURANT reste toujours sélectionnable, sinon on ne peut plus en
 *   sortir (cas atteignable par une URL partagée devenue vide) ;
 * - `sansObjet` désactive toute une dimension (la ville quand « En ligne »
 *   est choisi), indépendamment des compteurs.
 *
 * `n === null` (compteurs pas encore chargés) ne désactive rien : une option
 * dont on ignore le compteur n'est pas une option vide.
 */
export function optionDesactivee({
  n,
  choisi,
  sansObjet = false,
}: {
  n: number | null;
  choisi: boolean;
  sansObjet?: boolean;
}): boolean {
  return sansObjet || (n === 0 && !choisi);
}

