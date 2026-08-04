/**
 * Consentement de collecte — socle minimal (pas de bandeau générique à
 * l'usine). Une seule finalité affichée aujourd'hui : `mesureAudience`
 * (pilote l'audience du site). Le strict nécessaire (session, brouillon
 * local) n'entre pas ici : ce n'est pas un choix, cf. /confidentialite.
 *
 * L'enregistrement stocke un objet `finalites` OUVERT (`Record<string,
 * boolean>`), pas un couple de booléens nommés : ajouter une finalité
 * future (ex. personnalisation du feed, quand elle existera) est une
 * clé de plus à écrire dans `ecrireConsentement`, jamais une refonte de
 * cette forme ni du composant qui la lit. L'interface, elle, ne montre
 * que ce qui existe réellement — annoncer une case pour une collecte
 * qui n'a pas lieu n'informe personne.
 *
 * Stocké en `localStorage`, jamais un cookie : ce n'est pas une donnée que
 * le serveur a besoin de lire à chaque requête. La `version` existe pour
 * une seule raison — pouvoir redemander le choix si les finalités
 * changent, sans avoir à deviner ce qu'un ancien enregistrement couvrait.
 */

export const CONSENTEMENT_VERSION = 2;
export const CONSENTEMENT_STORAGE_KEY = "fid_consentement";
export const EVENEMENT_OUVRIR_CONSENTEMENT = "fid:ouvrir-consentement";

export type Finalites = Record<string, boolean>;

export interface Consentement {
  version: number;
  finalites: Finalites;
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
    if (typeof valeur.finalites !== "object" || valeur.finalites === null) return null;
    return valeur as Consentement;
  } catch {
    return null;
  }
}

export function ecrireConsentement(finalites: Finalites): Consentement {
  const consentement: Consentement = {
    version: CONSENTEMENT_VERSION,
    finalites,
    horodatage: new Date().toISOString(),
  };
  window.localStorage.setItem(CONSENTEMENT_STORAGE_KEY, JSON.stringify(consentement));
  return consentement;
}
