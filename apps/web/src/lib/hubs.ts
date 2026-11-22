/**
 * Règles PURES des pages hub (lot SEO-3, CONTRAT-V1 §3 vingt-deuxième
 * amendement) — aucune base, aucun réseau : testées dans tests/unit.ts.
 * Les accès base vivent dans app/api/v1/_lib/hubs.ts.
 */
import {
  HUBS_CATEGORIES,
  HUBS_EVENEMENTS,
  type EditionEvenement,
  type HubCategorie,
  type HubEvenement,
} from "../../content/hubs.js";
import { SITE_URL } from "./siteUrl.js";

/** Une page catégorie est indexable à partir de ce nombre de deals publiés actifs. */
export const SEUIL_INDEXATION_CATEGORIE = 8;

/** Plafonds de liste (amendement + lot SEO-3). */
export const LIMITE_DEALS_CATEGORIE = 48;
export const LIMITE_DEALS_EVENEMENT_EN_COURS = 60;
export const LIMITE_DEALS_HORS_SAISON = 12;
/** Remise minimale d'un deal listé pendant la fenêtre d'un événement. */
export const REMISE_MIN_EVENEMENT = 0.2;

/** Slug hors liste, ou « autre » (sans page) → null. */
export function hubParSlug(slug: string): HubCategorie | null {
  return HUBS_CATEGORIES.find((h) => h.slug === slug) ?? null;
}

/** Catégorie d'un deal → son hub. « Autre » n'a pas de page → null. */
export function hubParCategorie(categorie: string): HubCategorie | null {
  return HUBS_CATEGORIES.find((h) => h.categorie === categorie) ?? null;
}

export function estCategorieIndexable(nombreDealsActifs: number): boolean {
  return nombreDealsActifs >= SEUIL_INDEXATION_CATEGORIE;
}

/** Directive robots d'une page catégorie : rien (indexable) ou `noindex, follow`. */
export function robotsCategorie(nombreDealsActifs: number): { robots?: { index: false; follow: true } } {
  return estCategorieIndexable(nombreDealsActifs) ? {} : { robots: { index: false, follow: true } };
}

export function nomMinuscule(hub: HubCategorie): string {
  return hub.categorie.toLowerCase();
}

export function titreCategorie(hub: HubCategorie): string {
  return `Promo ${nomMinuscule(hub)} au Maroc : bons plans du jour`;
}

export function descriptionCategorie(hub: HubCategorie, nombre: number): string {
  return `${nombre} promos ${nomMinuscule(hub)} en cours au Maroc, avec prix d'origine et remise. Mis à jour chaque jour.`;
}

export function evenementParSlug(slug: string): HubEvenement | null {
  return HUBS_EVENEMENTS.find((e) => e.slug === slug) ?? null;
}

/**
 * Édition dont la fenêtre contient `aujourdhui` (AAAA-MM-JJ, jour de
 * Casablanca fourni par Postgres — jamais calculé côté Node, cf. PR #190).
 */
export function editionEnCours(evenement: HubEvenement, aujourdhui: string): EditionEvenement | null {
  return evenement.editions.find((ed) => ed.debut <= aujourdhui && aujourdhui <= ed.fin) ?? null;
}

export interface EtatEvenement {
  edition: EditionEvenement | null;
  /** Indexable si au moins une édition est configurée (en ou hors fenêtre). */
  indexable: boolean;
}

export function etatEvenement(evenement: HubEvenement, aujourdhui: string): EtatEvenement {
  return {
    edition: editionEnCours(evenement, aujourdhui),
    indexable: evenement.editions.length > 0,
  };
}

export interface MaillonAriane {
  nom: string;
  /** Chemin absolu sur le site ; absent pour le dernier maillon (page courante). */
  chemin?: string;
}

/** JSON-LD BreadcrumbList (schema.org). Le dernier maillon n'a pas d'URL. */
export function breadcrumbJsonLd(maillons: readonly MaillonAriane[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: maillons.map((m, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: m.nom,
      ...(m.chemin ? { item: new URL(m.chemin, SITE_URL).toString() } : {}),
    })),
  };
}
