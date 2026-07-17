"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface ApiErrorBody {
  error?: { code?: string };
}

/**
 * Vote depuis la carte — composant client minimal (boutons + score),
 * isolé du reste de DealCard qui reste rendu serveur (feed SSR, Phase 4).
 * Même endpoint et même pattern d'état que DealActions (page deal) : pas
 * de nouvel endpoint, juste le même flux réutilisé à plus petite échelle.
 */
export function CardVote({ publicId, initialScore }: { publicId: string; initialScore: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [score, setScore] = useState(initialScore);
  const [pending, setPending] = useState(false);

  async function vote(sens: "chaud" | "froid") {
    setPending(true);
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
        return;
      }
      if (typeof body.score === "number") setScore(body.score);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          void vote("chaud");
        }}
        disabled={pending}
        className="font-arabic border border-bordure rounded-lg px-2 py-1 text-sm font-bold text-vert hover:border-vert disabled:opacity-50"
      >
        ربح ▲
      </button>
      <span className={`text-base font-black min-w-[2ch] text-center ${score < 0 ? "text-bleu" : "text-rouge"}`}>
        {score}°
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          void vote("froid");
        }}
        disabled={pending}
        className="font-arabic border border-bordure rounded-lg px-2 py-1 text-sm font-bold text-rouge hover:border-rouge disabled:opacity-50"
      >
        ▼ خسارة
      </button>
    </div>
  );
}
