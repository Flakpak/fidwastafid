"use client";

import { useState } from "react";
import { Button } from "../../components/Button.js";

/**
 * Choix du motif de rejet — partagé par le rejet unitaire (AdminDealItem) et le
 * rejet groupé (AdminPipeline), pour que les deux chemins offrent exactement les
 * mêmes raccourcis.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Fait générateur (27/07/2026) : au premier rejet réel en production, le motif
 * est resté vide. Le champ existait, mais il vivait au fond du panneau
 * « Éditer le deal », replié, alors que le bouton « Rejeter » était en haut de
 * la carte — le curateur pouvait rejeter sans jamais voir le champ. Ce n'était
 * donc pas une négligence, c'était un défaut d'agencement.
 *
 * Deux décisions en découlent :
 *   - le motif est demandé AU MOMENT du rejet, pas rangé ailleurs ;
 *   - il y a des raccourcis. Un champ obligatoire sans raccourci se remplit de
 *     « x » — l'obligation seule déplace le problème au lieu de le régler.
 *
 * Un clic sur un motif préenregistré rejette immédiatement : le chemin nominal
 * ne coûte pas plus cher qu'avant l'obligation. Le champ libre reste là pour
 * tout ce que la liste ne couvre pas.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Liste volontairement courte : au-delà, on ne lit plus, on clique au hasard. */
export const MOTIFS_REJET = [
  "Prix erroné",
  "Doublon",
  "Lien mort",
  "Hors sujet",
  "Informations insuffisantes",
  "Test",
] as const;

/** Même plancher que le schéma zod (`motifRejet: min(3)`) — écarte "" et "x". */
const MOTIF_MIN = 3;

interface MotifRejetProps {
  /** Libellé de l'action de confirmation (« Rejeter », « Rejeter les 12 »...). */
  libelleConfirmation: string;
  onRejeter: (motif: string) => void | Promise<void>;
  onAnnuler: () => void;
  pending?: boolean;
}

export function MotifRejet({ libelleConfirmation, onRejeter, onAnnuler, pending = false }: MotifRejetProps) {
  const [libre, setLibre] = useState("");
  const libreValide = libre.trim().length >= MOTIF_MIN;

  return (
    <div className="border border-warn/40 bg-warn-soft rounded-lg p-2.5 flex flex-col gap-2">
      <p className="text-xs font-bold text-ink">
        Motif du rejet — visible par le soumetteur dans son espace membre.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {MOTIFS_REJET.map((motif) => (
          <button
            key={motif}
            type="button"
            onClick={() => void onRejeter(motif)}
            disabled={pending}
            className="rounded-full border border-border-strong bg-surface px-2.5 py-1 text-xs font-bold text-ink cursor-pointer transition-colors duration-[130ms] hover:bg-surface-subtle disabled:opacity-50 motion-reduce:transition-none"
          >
            {motif}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-xs font-bold text-ink">
        Autre motif
        <textarea
          value={libre}
          onChange={(e) => setLibre(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Explique en une phrase ce qui bloque."
          className="border border-border-strong bg-surface text-ink rounded-[7px] px-2 py-1 font-normal text-sm focus:border-accent focus:outline-none"
        />
      </label>

      <div className="flex items-center gap-2">
        <Button
          variant="danger"
          size="sm"
          onClick={() => void onRejeter(libre.trim())}
          disabled={pending || !libreValide}
        >
          {libelleConfirmation}
        </Button>
        <button
          type="button"
          onClick={onAnnuler}
          disabled={pending}
          className="text-xs font-bold text-ink-muted hover:text-ink cursor-pointer disabled:opacity-50"
        >
          Annuler
        </button>
        {!libreValide && libre.length > 0 && (
          <span className="text-xs text-ink-subtle">{MOTIF_MIN} caractères minimum.</span>
        )}
      </div>
    </div>
  );
}
