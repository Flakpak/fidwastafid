/**
 * Consentement de collecte — socle minimal (pas de bandeau générique à
 * l'usine). Deux catégories fermées : `mesureAudience` (Vercel Analytics,
 * seul appelant aujourd'hui) et `personnalisation` (feed personnalisé par
 * les deals consultés, déclarée pour plus tard — aucune collecte ne s'y
 * adosse encore). Le strict nécessaire (session, brouillon local) n'entre
 * pas ici : ce n'est pas un choix, cf. /confidentialite.
 *
 * Stocké en `localStorage`, jamais un cookie : ce n'est pas une donnée que
 * le serveur a besoin de lire à chaque requête. La `version` existe pour
 * une seule raison — pouvoir redemander le choix si les finalités
 * changent, sans avoir à deviner ce qu'un ancien enregistrement couvrait.
 */

export const CONSENTEMENT_VERSION = 1;
export const CONSENTEMENT_STORAGE_KEY = "fid_consentement";
export const EVENEMENT_OUVRIR_CONSENTEMENT = "fid:ouvrir-consentement";

export interface Consentement {
  version: number;
  mesureAudience: boolean;
  personnalisation: boolean;
  horodatage: string;
}

/** `null` = pas de choix valide pour la version courante (jamais demandé,
 *  ou demandé sous une version périmée) — l'appelant doit rouvrir le choix. */
export function lireConsentement(): Consentement | null {
  if (typeof window === "undefined") return null;
  try {
    const brut = window.localStorage.getItem(CONSENTEMENT_STORAGE_KEY);
    if (!brut) return null;
    const valeur = JSON.parse(brut) as Partial<Consentement>;
    if (valeur.version !== CONSENTEMENT_VERSION) return null;
    if (typeof valeur.mesureAudience !== "boolean" || typeof valeur.personnalisation !== "boolean") return null;
    return valeur as Consentement;
  } catch {
    return null;
  }
}

export function ecrireConsentement(choix: { mesureAudience: boolean; personnalisation: boolean }): Consentement {
  const consentement: Consentement = {
    version: CONSENTEMENT_VERSION,
    mesureAudience: choix.mesureAudience,
    personnalisation: choix.personnalisation,
    horodatage: new Date().toISOString(),
  };
  window.localStorage.setItem(CONSENTEMENT_STORAGE_KEY, JSON.stringify(consentement));
  return consentement;
}
