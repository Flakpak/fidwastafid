"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface ApiErrorBody {
  error?: { code?: string };
}

/**
 * Pilule de vote — capsule bordée unique [خسارة | score | ربح], porté
 * depuis le design Dealabs (structure uniquement, charte fidwastafid).
 * Composant client minimal (boutons + score), isolé du reste de DealCard
 * qui reste rendu serveur (feed SSR, Phase 4). Même endpoint et même
 * pattern d'état que DealActions (page deal).
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
  );
}
