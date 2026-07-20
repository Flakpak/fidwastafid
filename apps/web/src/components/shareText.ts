/**
 * Texte du bouton "Partager" (Web Share API, ShareButton.tsx) — incident du
 * 20/07/2026 : "Fidwastafid : {titre} à {prix} DH..." faisait doublon avec
 * la carte de lien (titre déjà dans og:title, domaine déjà visible dans
 * l'aperçu WhatsApp) — extrait en fonction pure pour être testable sans DOM
 * ni navigator.share.
 */
export function buildShareText(prixPromo: number, prixNormal: number | undefined, url: string): string {
  const pct = prixNormal && prixNormal > prixPromo ? Math.round((1 - prixPromo / prixNormal) * 100) : null;
  const prixLigne = pct !== null ? `${prixPromo} DH (-${pct}%)` : `${prixPromo} DH`;
  return `${prixLigne}\n${url}`;
}
