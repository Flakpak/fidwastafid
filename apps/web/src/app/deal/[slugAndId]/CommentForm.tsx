"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface ApiErrorBody {
  error?: { code?: string };
}

export function CommentForm({ publicId }: { publicId: string }) {
  const router = useRouter();
  const [contenu, setContenu] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/deals/${publicId}/commentaires`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu }),
      });
      if (!res.ok) {
        // res.json() peut lui-même échouer (réponse d'erreur non structurée,
        // ex. 500 hors format API) — sans ce try imbriqué, l'exception
        // remontait hors du bloc et `setError` n'était jamais appelé
        // (même défaut que SoumettreForm, incident du 19/07/2026).
        let message = "Envoi impossible.";
        try {
          const body = (await res.json()) as ApiErrorBody;
          if (body.error?.code === "UNAUTHENTICATED") message = "Connecte-toi pour commenter.";
          else if (body.error?.code === "RATE_LIMITED") message = "Trop de commentaires, réessaie plus tard.";
        } catch {
          // Message générique déjà posé ci-dessus.
        }
        setError(message);
        return;
      }
      setContenu("");
      router.refresh();
    } catch {
      setError("Envoi impossible, réessaie.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        value={contenu}
        onChange={(e) => setContenu(e.target.value)}
        required
        minLength={1}
        maxLength={2000}
        rows={3}
        placeholder="Un avis sur ce bon plan ?"
        className="border border-bordure rounded px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        className="self-start bg-rouge text-white rounded px-4 py-2 font-bold text-sm disabled:opacity-50"
      >
        {pending ? "Envoi..." : "Commenter"}
      </button>
      {error && <p className="text-sm text-rouge">{error}</p>}
    </form>
  );
}
