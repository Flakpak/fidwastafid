"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { VoteSens } from "@fidwastafid/schemas";
import { temperature } from "../lib/score.js";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

/** Chevrons 16px (charte Tadelakt / maquette). */
const CHEVRON_UP = "M6 15l6-6 6 6";
const CHEVRON_DOWN = "M6 9l6 6 6-6";

/**
 * Groupe de vote — [خسارة | score | ربح] en ligne dans le corps de la carte
 * (aucun rail, aucun déplacement). Îlot client minimal (boutons + score),
 * réutilisé tel quel sur la carte du feed ET la page deal.
 *
 * Charte Tadelakt (CONTRAT-V1 §8). Depuis le lot 4, chaque flèche porte sa
 * température AU REPOS (fond doux + icône teintée) ; survol et vote passent au
 * fond plein. Lot 6 : ni conteneur bordé ni contour de pastille — deux
 * surfaces pleines n'ont pas besoin d'être enfermées — et plus de jauge, le
 * score en graisse 700 portant seul le niveau. Le chiffre reste lu : la
 * couleur n'est jamais la seule information.
 *
 * Les libellés `ربح`/`خسارة` sont conservés (non négociables, CONTRAT-V1 §8) :
 * la maquette montre des boutons chevron seuls, mais le contrat prime. Les
 * chevrons 16px demandés sont ajoutés à côté des libellés.
 *
 * L'état « voté » (fond plein) reste optimiste au clic — inchangé. Ce qui
 * change (CONTRAT-V1 §4, seizième amendement conscient) : l'état INITIAL
 * peut désormais venir du serveur via `monVote` — `undefined` tant qu'il
 * n'est pas connu (anonyme, ou fetch en cours), `null` = connu et non voté,
 * `"chaud"`/`"froid"` = connu et voté. Appliqué UNE SEULE fois (`appliqueRef`) :
 * un clic qui suit n'est jamais écrasé par une réponse serveur arrivée en
 * retard — c'est ce qui garde l'état optimiste intact après cette persistance.
 */
export function CardVote({
  publicId,
  initialScore,
  monVote,
}: {
  publicId: string;
  initialScore: number;
  /** `undefined` = pas encore connu (jamais appliqué) ; `null` = connu, non voté. */
  monVote?: VoteSens | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [score, setScore] = useState(initialScore);
  const [voted, setVoted] = useState<VoteSens | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appliqueRef = useRef(false);
  useEffect(() => {
    if (!appliqueRef.current && monVote !== undefined) {
      setVoted(monVote);
      appliqueRef.current = true;
    }
  }, [monVote]);

  async function vote(sens: VoteSens) {
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
  /**
   * Lot 6 — la jauge est retirée. Le chiffre porte seul le niveau, compensé
   * par la graisse 700 et 15px : il devient l'objet lisible du groupe, et les
   * trois teintes (hot / ink / cold) restent distinguables sans le lire.
   */
  const scoreColor = temp === "chaud" ? "text-hot" : temp === "froid" ? "text-cold" : "text-ink";

  /**
   * Lot 4 — CORRECTION D'AFFORDANCE, pas un choix esthétique. Les flèches
   * n'étaient teintées qu'au survol : sur mobile, où le survol n'existe pas,
   * rien n'indiquait jamais que le haut est chaud et le bas froid. Chaque
   * flèche porte donc sa teinte EN PERMANENCE (fond doux + icône), le survol
   * et l'état voté passant au fond plein.
   *
   * Lot 6 — les contours des pastilles et le conteneur bordé sont retirés :
   * deux surfaces déjà pleines n'ont pas besoin d'être enfermées dans une
   * boîte. Les pastilles restent collées, séparées de 1px.
   *
   * Trois états distinguables sans survol : repos (fond doux), pressé/voté
   * (plein, icône blanche), désactivé (opacité). Cible ≥ 44px conservée en
   * mobile via `max-sm:min-h-11`.
   */
  const froidCls =
    voted === "froid"
      ? "bg-cold text-white"
      : "bg-cold-soft text-cold hover:bg-cold hover:text-white";
  const chaudCls =
    voted === "chaud"
      ? "bg-hot text-white"
      : "bg-hot-soft text-hot hover:bg-hot hover:text-white";

  return (
    <div className="inline-flex flex-col gap-0.5">
      {/* Plus de conteneur bordé (lot 6) : les pastilles sont collées, séparées
          de 1px, et se suffisent comme surfaces pleines. */}
      <div className="inline-flex items-stretch gap-px text-sm">
        {/* Vote froid — خسارة (bas). */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void vote("froid");
          }}
          disabled={pending}
          aria-label="Voter خسارة (froid)"
          className={`font-arabic flex min-h-[29px] items-center gap-1 rounded-[8px] px-2.5 font-bold transition-colors duration-[130ms] motion-reduce:transition-none disabled:opacity-50 max-sm:min-h-11 ${froidCls}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} aria-hidden="true" className="h-4 w-4">
            <path d={CHEVRON_DOWN} />
          </svg>
          خسارة
        </button>

        {/* Score — seul porteur du niveau depuis le retrait de la jauge : 15px
            graisse 700, teinté par température. Le chiffre reste lu, la couleur
            n'est jamais la seule information. */}
        <span
          className={`flex min-w-[42px] items-center justify-center px-1.5 text-[15px] font-bold leading-none tracking-[-0.03em] tabular-nums ${scoreColor}`}
        >
          {score}°
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
          className={`font-arabic flex min-h-[29px] items-center gap-1 rounded-[8px] px-2.5 font-bold transition-colors duration-[130ms] motion-reduce:transition-none disabled:opacity-50 max-sm:min-h-11 ${chaudCls}`}
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
