"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { temperature, jaugeRemplissage } from "../lib/score.js";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

/** Chevrons 16px (charte Tadelakt / maquette). */
const CHEVRON_UP = "M6 15l6-6 6 6";
const CHEVRON_DOWN = "M6 9l6 6 6-6";

/**
 * Pilule de vote — capsule bordée unique [خسارة | score | ربح], en ligne dans
 * le corps de la carte (aucun rail, aucun déplacement). Îlot client minimal
 * (boutons + score), réutilisé tel quel sur la carte du feed ET la page deal.
 *
 * Charte Tadelakt (CONTRAT-V1 §8) : filet `border-strong`, fond `surface`,
 * rayon 20px. Au repos les boutons sont en encre atténuée ; la température ne
 * paraît qu'au survol (`hot-soft`/`cold-soft`) et au vote (fond plein). Le
 * score est teinté par sa zone (hot ≥ seuil, cold < 0, ink neutre) et suivi
 * d'une jauge proportionnelle — la température reste lisible sans lire le
 * chiffre, et n'est jamais portée par la seule couleur.
 *
 * Les libellés `ربح`/`خسارة` sont conservés (non négociables, CONTRAT-V1 §8) :
 * la maquette montre des boutons chevron seuls, mais le contrat prime. Les
 * chevrons 16px demandés sont ajoutés à côté des libellés.
 *
 * L'état « voté » (fond plein) est optimiste, côté client : le composant ne
 * reçoit que le score, pas le vote courant de l'utilisateur (le brancher
 * durablement demanderait une donnée SSR/API — hors périmètre cosmétique).
 */
export function CardVote({ publicId, initialScore }: { publicId: string; initialScore: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [score, setScore] = useState(initialScore);
  const [voted, setVoted] = useState<"chaud" | "froid" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function vote(sens: "chaud" | "froid") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/deals/${publicId}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sens }),
      });
      const body = (await res.json()) as ApiErrorBody & { score?: number };
      if (!res.ok) {
        if (body.error?.code === "UNAUTHENTICATED") {
          router.push(`/connexion?next=${encodeURIComponent(pathname)}`);
          return;
        }
        setError(body.error?.code === "RATE_LIMITED" ? "Trop de votes, réessaie plus tard." : "Vote impossible.");
        return;
      }
      if (typeof body.score === "number") setScore(body.score);
      setVoted(sens);
    } catch {
      setError("Vote impossible, réessaie.");
    } finally {
      setPending(false);
    }
  }

  const temp = temperature(score);
  const scoreColor = temp === "chaud" ? "text-hot" : temp === "froid" ? "text-cold" : "text-ink";
  const gaugeColor = temp === "chaud" ? "bg-hot" : temp === "froid" ? "bg-cold" : "bg-ink-muted";
  const remplissage = jaugeRemplissage(score);

  const froidCls = voted === "froid" ? "bg-cold text-white" : "text-ink-muted hover:bg-cold-soft hover:text-cold";
  const chaudCls = voted === "chaud" ? "bg-hot text-white" : "text-ink-muted hover:bg-hot-soft hover:text-hot";

  return (
    <div className="inline-flex flex-col gap-0.5">
      <div className="inline-flex items-stretch overflow-hidden rounded-[20px] border border-border-strong bg-surface text-sm">
        {/* Vote froid — خسارة (bas). */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void vote("froid");
          }}
          disabled={pending}
          aria-label="Voter خسارة (froid)"
          className={`font-arabic flex min-h-[27px] items-center gap-1 px-2.5 font-bold transition-colors duration-[130ms] motion-reduce:transition-none disabled:opacity-50 max-sm:min-h-11 ${froidCls}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} aria-hidden="true" className="h-4 w-4">
            <path d={CHEVRON_DOWN} />
          </svg>
          خسارة
        </button>

        {/* Score + jauge — teinté par température, jamais une couleur seule (le
            chiffre porte l'info, la jauge la rend lisible d'un coup d'œil). */}
        <span className={`flex flex-col items-center justify-center border-x border-border px-1.5 ${scoreColor}`}>
          <span className="text-[14.5px] font-semibold leading-none tabular-nums">{score}°</span>
          <span aria-hidden="true" className="mt-0.5 h-[3px] w-[30px] overflow-hidden rounded-full bg-border">
            <span className={`block h-full rounded-full ${gaugeColor}`} style={{ width: `${remplissage}%` }} />
          </span>
        </span>

        {/* Vote chaud — ربح (haut). */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void vote("chaud");
          }}
          disabled={pending}
          aria-label="Voter ربح (chaud)"
          className={`font-arabic flex min-h-[27px] items-center gap-1 px-2.5 font-bold transition-colors duration-[130ms] motion-reduce:transition-none disabled:opacity-50 max-sm:min-h-11 ${chaudCls}`}
        >
          ربح
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} aria-hidden="true" className="h-4 w-4">
            <path d={CHEVRON_UP} />
          </svg>
        </button>
      </div>
      {error && <span className="text-[10px] font-semibold text-warn">{error}</span>}
    </div>
  );
}
