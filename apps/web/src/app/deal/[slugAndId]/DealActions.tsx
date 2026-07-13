"use client";

import { useState } from "react";
import type { Deal } from "@fidwastafid/schemas";

interface ApiErrorBody {
  error?: { code?: string };
}

export function DealActions({ deal }: { deal: Deal }) {
  const [score, setScore] = useState(deal.score);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function vote(sens: "chaud" | "froid") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/deals/${deal.publicId}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sens }),
      });
      const body = (await res.json()) as ApiErrorBody & { score?: number };
      if (!res.ok) {
        setError(body.error?.code === "UNAUTHENTICATED" ? "Connecte-toi pour voter." : "Vote impossible.");
        return;
      }
      if (typeof body.score === "number") setScore(body.score);
    } finally {
      setPending(false);
    }
  }

  async function removeVote() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/deals/${deal.publicId}/votes`, { method: "DELETE" });
      const body = (await res.json()) as ApiErrorBody & { score?: number };
      if (!res.ok) {
        setError(body.error?.code === "UNAUTHENTICATED" ? "Connecte-toi pour voter." : "Action impossible.");
        return;
      }
      if (typeof body.score === "number") setScore(body.score);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => vote("chaud")}
          disabled={pending}
          className="bg-creme border border-bordure rounded-lg px-3 py-1.5 font-bold text-sm disabled:opacity-50"
        >
          🔥 Chaud
        </button>
        <span className="text-2xl font-black text-rouge min-w-[2ch] text-center">{score}</span>
        <button
          type="button"
          onClick={() => vote("froid")}
          disabled={pending}
          className="bg-creme border border-bordure rounded-lg px-3 py-1.5 font-bold text-sm disabled:opacity-50"
        >
          ❄️ Froid
        </button>
        <button type="button" onClick={removeVote} disabled={pending} className="text-xs text-muted underline">
          Retirer mon vote
        </button>
      </div>
      {error && <p className="text-sm text-rouge">{error}</p>}
    </div>
  );
}
