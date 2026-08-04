"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { Button } from "./Button.js";
import {
  EVENEMENT_OUVRIR_CONSENTEMENT,
  ecrireConsentement,
  lireConsentement,
  type Consentement as ConsentementRecord,
} from "../lib/consentement.js";

/**
 * `useState(lireConsentement)` — initialiseur PARESSEUX : il s'exécute
 * pendant le rendu lui-même, jamais dans un effet après coup. Côté serveur
 * `window` n'existe pas (`lireConsentement` renvoie `null`), donc le HTML
 * envoyé ne monte jamais `<Analytics />`. Côté client, ce même rendu est
 * celui de l'hydratation : le `localStorage` est relu AVANT toute peinture,
 * pas après un aller-retour d'effet. Il n'existe donc aucune fenêtre où
 * `<Analytics />` serait monté — et donc aucune requête envoyée — avant que
 * ce composant ait lu un consentement déjà donné.
 *
 * Script (`/_vercel/insights/script.js`) et endpoint de collecte
 * (`/_vercel/insights/*`) sont même origine — déjà couverts par le CSP
 * existant (`script-src 'strict-dynamic'`, `connect-src 'self'`,
 * `middleware.ts`). Aucun ajustement CSP requis par ce composant.
 */
export function Consentement() {
  const [consentement, setConsentement] = useState<ConsentementRecord | null>(lireConsentement);
  const [ouvert, setOuvert] = useState(() => lireConsentement() === null);

  useEffect(() => {
    const ouvrir = () => setOuvert(true);
    window.addEventListener(EVENEMENT_OUVRIR_CONSENTEMENT, ouvrir);
    return () => window.removeEventListener(EVENEMENT_OUVRIR_CONSENTEMENT, ouvrir);
  }, []);

  function choisir(mesureAudience: boolean) {
    setConsentement(ecrireConsentement({ mesureAudience, personnalisation: false }));
    setOuvert(false);
  }

  return (
    <>
      {consentement?.mesureAudience && <Analytics />}
      {ouvert && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="consentement-titre"
            className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-5 shadow-[0_4px_16px_rgba(26,24,21,0.12)] flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p id="consentement-titre" className="text-sm text-ink-muted leading-relaxed">
              On mesure l&apos;audience du site (Vercel Analytics) pour savoir ce qui est utile.
              Une deuxième catégorie, la personnalisation du feed, est prévue mais inactive : rien
              n&apos;y est collecté aujourd&apos;hui.{" "}
              <Link href="/confidentialite" className="text-accent font-bold hover:underline">
                En savoir plus
              </Link>
              .
            </p>
            {/* Deux actions du même poids visuel (`secondary` pour les deux) —
                refuser ne doit pas se lire comme le choix par défaut ni comme
                le moins engageant des deux. §8 règle 1 (une seule action
                pleine par écran) reste respectée : zéro action pleine ici. */}
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" onClick={() => choisir(false)}>
                Refuser
              </Button>
              <Button variant="secondary" onClick={() => choisir(true)}>
                Accepter
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
