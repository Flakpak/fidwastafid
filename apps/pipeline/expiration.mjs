// ============================================================
// FIDWASTAFID — Expiration des deals auto_draft trop anciens (Phase 7B)
//
// Prédicat pur (testable offline, sans base — tests/expiration.test.mjs) :
// reflète exactement la clause WHERE de l'UPDATE SQL réel
// (expirer-auto-draft.mjs). Un deal auto_draft plus vieux que
// SEUIL_JOURS_AUTO_DRAFT doit expirer ; tout autre statut (publie,
// en_attente, rejete, déjà expire) n'est JAMAIS touché par cette étape,
// quel que soit son âge — seul auto_draft (jamais vu par un admin) est
// concerné par cette purge automatique.
// ============================================================

/** Première étape de chaque run quotidien (purge le stock mort avant
 *  d'ajouter du frais) — CONTRAT-V1 §1 : un deal expiré garde son URL à
 *  vie (HTTP 200, jamais de suppression), l'expiration n'est qu'un
 *  changement de statut. */
export const SEUIL_JOURS_AUTO_DRAFT = 14;

/**
 * @param {{ statut: string, createdAt: string | Date }} deal
 * @param {Date} maintenant
 * @param {number} seuilJours
 * @returns {boolean}
 */
export function estExpirable(deal, maintenant = new Date(), seuilJours = SEUIL_JOURS_AUTO_DRAFT) {
  if (deal.statut !== "auto_draft") return false;
  const seuilMs = seuilJours * 24 * 60 * 60 * 1000;
  return maintenant.getTime() - new Date(deal.createdAt).getTime() > seuilMs;
}

// ============================================================
// Expiration des deals PUBLIÉS dont la date de fin est passée (lot SEO-2b)
//
// Reflète exactement la clause WHERE de expirer-publies.mjs :
//   statut = 'publie' AND supprime_le IS NULL
//   AND date_fin < (now() at time zone 'Africa/Casablanca')::date
// `date_fin` est une colonne `date` (sans fuseau) : elle se compare au
// JOUR CALENDAIRE de Casablanca, pas à l'UTC. Le jour de fin lui-même reste
// publié ; le deal expire le lendemain.
// ============================================================

export const FUSEAU_EXPIRATION = "Africa/Casablanca";

/** Date du jour (YYYY-MM-DD) dans le fuseau donné. */
export function dateDuJour(maintenant = new Date(), fuseau = FUSEAU_EXPIRATION) {
  // en-CA formate en YYYY-MM-DD, comparable lexicographiquement à date_fin.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fuseau,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(maintenant);
}

/**
 * @param {{ statut: string, dateFin: string | null, supprimeLe?: string | null }} deal
 * @param {Date} maintenant
 * @returns {boolean}
 */
export function estPublieExpirable(deal, maintenant = new Date()) {
  if (deal.statut !== "publie") return false;
  if (deal.supprimeLe) return false;
  if (!deal.dateFin) return false;
  return deal.dateFin < dateDuJour(maintenant);
}
