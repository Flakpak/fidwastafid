"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * Pilule de vote — capsule bordée unique [خسارة | score | ربح], porté
 * depuis le design Dealabs (structure uniquement, charte fidwastafid).
 * Composant client minimal (boutons + score), isolé du reste de son
 * conteneur (feed SSR, page deal). Réutilisé tel quel sur la carte du feed
 * ET la page deal — pas de retrait de vote ici, seulement chaud/froid (le
 * pattern Dealabs n'a pas ce bouton, cohérent avec la simplification).
 */
export function CardVote({ publicId, initialScore }: { publicId: string; initialScore: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [score, setScore] = useState(initialScore);
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
    } catch {
      setError("Vote impossible, réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="inline-flex flex-col gap-0.5">
      <div className="inline-flex items-center rounded-full border border-bordure bg-white overflow-hidden text-sm">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void vote("froid");
          }}
          disabled={pending}
          className="font-arabic px-2.5 py-1 font-bold text-rouge hover:bg-creme disabled:opacity-50"
        >
          ▼ خسارة
        </button>
        <span
          className={`px-1.5 font-black border-x border-bordure ${score < 0 ? "text-bleu" : "text-rouge"}`}
        >
          {score}°
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            void vote("chaud");
          }}
          disabled={pending}
          className="font-arabic px-2.5 py-1 font-bold text-vert hover:bg-creme disabled:opacity-50"
        >
          ربح ▲
        </button>
      </div>
      {error && <span className="text-[10px] text-rouge font-semibold">{error}</span>}
    </div>
  );
}
