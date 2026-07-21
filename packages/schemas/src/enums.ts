import { z } from "zod";

/**
 * Valeurs réelles en production (extraites de index.html, const VILLES).
 * "National" n'est PAS une anomalie : une promo valable dans tous les
 * magasins d'une enseigne reste "physique" sans ville précise.
 * Liste fermée volontaire (CONTRAT-V1 §3) — pas de table dédiée en v1.
 */
export const VILLES = [
  "National",
  "Casablanca",
  "Rabat",
  "Marrakech",
  "Fès",
  "Tanger",
  "Agadir",
  "Meknès",
  "Oujda",
] as const;

export const villeSchema = z.enum(VILLES);
export type Ville = z.infer<typeof villeSchema>;

/** Slugs pour /ville/[slug] (Phase 4) — normalisation figée une fois pour toutes. */
export const VILLE_SLUGS: Record<Ville, string> = {
  National: "national",
  Casablanca: "casablanca",
  Rabat: "rabat",
  Marrakech: "marrakech",
  Fès: "fes",
  Tanger: "tanger",
  Agadir: "agadir",
  Meknès: "meknes",
  Oujda: "oujda",
};

/** Valeurs réelles en production (extraites de index.html, const CATEGORIES).
 *  Étendu le 21/07/2026 (taxonomie v2, CONTRAT-V1 §3 cinquième amendement) :
 *  +4 valeurs alimentables par le futur pipeline multi-sources. Les 8
 *  premières sont conservées à l'identique (libellés/valeurs/casse) — aucun
 *  renommage, aucune migration destructive. */
export const CATEGORIES = [
  "Alimentaire",
  "Électroménager",
  "High-Tech",
  "Mode",
  "Maison",
  "Beauté",
  "Sport",
  "Autre",
  "Téléphonie & Internet",
  "Gaming",
  "Bricolage & Jardin",
  "Voyages",
] as const;

export const categorieSchema = z.enum(CATEGORIES);
export type Categorie = z.infer<typeof categorieSchema>;

/** Slugs pour /categorie/[slug] (Phase 4). */
export const CATEGORIE_SLUGS: Record<Categorie, string> = {
  Alimentaire: "alimentaire",
  Électroménager: "electromenager",
  "High-Tech": "high-tech",
  Mode: "mode",
  Maison: "maison",
  Beauté: "beaute",
  Sport: "sport",
  Autre: "autre",
  "Téléphonie & Internet": "telephonie-internet",
  Gaming: "gaming",
  "Bricolage & Jardin": "bricolage-jardin",
  Voyages: "voyages",
};

/** Couleurs d'avatar — espace membre (CONTRAT-V1 §4, amendement 16/07/2026).
 *  Mêmes valeurs que la contrainte CHECK de users.couleur_avatar (packages/db). */
export const COULEURS_AVATAR = [
  "rouge",
  "terracotta",
  "or",
  "olive",
  "bleu",
  "indigo",
  "prune",
  "ardoise",
] as const;

export const couleurAvatarSchema = z.enum(COULEURS_AVATAR);
export type CouleurAvatar = z.infer<typeof couleurAvatarSchema>;
