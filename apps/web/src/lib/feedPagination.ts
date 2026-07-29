import type { Deal } from "@fidwastafid/schemas";

/**
 * Primitives de pagination du feed — extraites de Feed.tsx pour être testables
 * hors navigateur (le harnais `pnpm test` est hors ligne, cf. tests/unit.ts).
 *
 * Contexte : jusqu'au 26/07/2026, le feed demandait 24 deals et n'exploitait
 * jamais le `nextCursor` renvoyé par l'API — 57 des 81 deals publiés étaient
 * donc invisibles en production, sans la moindre erreur. L'API paginait
 * pourtant correctement (`limit + 1` → `hasMore`).
 */

/** Taille de page demandée à l'API. Le plafond serveur est MAX_LIMIT = 50
 *  (api/v1/deals/route.ts) — on reste sous ce seuil, et surtout on ne « règle »
 *  jamais le problème en montant la limite : c'est le curseur qui supprime le
 *  plafond, pas une constante plus grande. */
export const TAILLE_PAGE = 24;

export interface FiltresFeed {
  tri: string;
  ville?: string;
  categorie?: string;
  /** Chaîne vide = pas de filtre de disponibilité (« partout »). */
  type?: string;
  /** Recherche — filtre SERVEUR depuis le lot 7 (titre + enseigne). */
  q?: string;
  /** Curseur opaque de la page précédente, retransmis TEL QUEL. */
  cursor?: string | null;
}

/**
 * Paramètres de filtre communs à la liste et aux compteurs. Extraits pour
 * que les deux appels ne puissent pas dériver l'un de l'autre : des
 * compteurs calculés sur d'autres filtres que la liste seraient faux sans
 * qu'aucune erreur ne le signale.
 */
function ajouterFiltres(params: URLSearchParams, f: FiltresFeed): URLSearchParams {
  if (f.ville) params.set("ville", f.ville);
  if (f.categorie) params.set("categorie", f.categorie);
  if (f.type) params.set("type", f.type);
  if (f.q) params.set("q", f.q);
  return params;
}

/** Query string de `GET /api/v1/deals/compte` — ni tri, ni limite, ni curseur. */
export function construireParamsCompte(f: FiltresFeed): URLSearchParams {
  return ajouterFiltres(new URLSearchParams(), f);
}

/**
 * Construit la query string du feed.
 *
 * Le curseur est réémis **verbatim**, jamais reconstruit : il encode `asOf`
 * (qui fige le classement pendant toute la navigation, sans quoi un deal
 * remonté entre deux pages apparaîtrait deux fois ou sauterait) et `publicId`
 * (qui départage les ex æquo d'un tri non unique). Le décomposer côté client
 * casserait les deux garanties.
 */
export function construireParamsFeed(f: FiltresFeed): URLSearchParams {
  const params = ajouterFiltres(new URLSearchParams({ limit: String(TAILLE_PAGE), tri: f.tri }), f);
  if (f.cursor) params.set("cursor", f.cursor);
  return params;
}

/**
 * Concatène une nouvelle page en écartant les `publicId` déjà présents.
 *
 * Garde-fou obligatoire : un curseur mal départagé republie des lignes déjà
 * servies. C'est le mode d'échec classique de la pagination par curseur, et il
 * ne lève AUCUNE erreur — sans cette déduplication, le doublon se voit
 * seulement à l'œil, sur une carte répétée au milieu du feed.
 */
export function fusionnerSansDoublon(existants: Deal[], nouveaux: Deal[]): Deal[] {
  const vus = new Set(existants.map((d) => d.publicId));
  const ajouts = nouveaux.filter((d) => {
    if (vus.has(d.publicId)) return false;
    vus.add(d.publicId); // couvre aussi un doublon INTERNE à la page reçue
    return true;
  });
  return ajouts.length === 0 ? existants : [...existants, ...ajouts];
}

/** Message utilisateur d'un échec de chargement — jamais un silence, jamais
 *  une liste vide présentée comme un résultat normal. */
export function messageErreurFeed(statut?: number): string {
  if (statut === 429) return "Trop de requêtes d'affilée. Patiente quelques secondes, puis réessaie.";
  if (statut !== undefined && statut >= 500) return "Le serveur n'a pas répondu correctement. Réessaie dans un instant.";
  return "Impossible de charger les deals. Vérifie ta connexion, puis réessaie.";
}
