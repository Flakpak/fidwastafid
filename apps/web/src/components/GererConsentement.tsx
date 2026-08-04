"use client";

import { EVENEMENT_OUVRIR_CONSENTEMENT } from "../lib/consentement.js";

/** Accès permanent depuis le pied de page pour revenir sur son choix — sans
 *  lui, un refus initial serait définitif faute de tout autre chemin. */
export function GererConsentement() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENEMENT_OUVRIR_CONSENTEMENT))}
      className="cursor-pointer border-none bg-transparent p-0 text-xs text-ink-muted hover:text-ink"
    >
      Cookies
    </button>
  );
}
