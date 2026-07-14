"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { VILLES, CATEGORIES, type Enseigne } from "@fidwastafid/schemas";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export function SoumettreForm({ enseignes }: { enseignes: Enseigne[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<"physique" | "en_ligne" | "les_deux">("physique");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const turnstileToken = data.get("cf-turnstile-response");

    const enseigneSlug = data.get("enseigneSlug");
    const ville = data.get("ville");
    const prixNormal = data.get("prixNormal");
    const dateFin = data.get("dateFin");
    const description = data.get("description");
    const lien = data.get("lien");

    const body = {
      titre: String(data.get("titre") ?? ""),
      enseigneSlug: enseigneSlug ? String(enseigneSlug) : undefined,
      ville: ville ? String(ville) : undefined,
      categorie: String(data.get("categorie") ?? ""),
      type,
      prixPromo: Number(data.get("prixPromo")),
      prixNormal: prixNormal ? Number(prixNormal) : undefined,
      dateFin: dateFin ? String(dateFin) : undefined,
      description: description ? String(description) : undefined,
      lien: lien ? String(lien) : undefined,
    };

    try {
      const res = await fetch("/api/v1/deals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-turnstile-token": turnstileToken ? String(turnstileToken) : "",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = (await res.json()) as ApiErrorBody;
        if (errBody.error?.code === "UNAUTHENTICATED") {
          setError("Connecte-toi pour proposer un bon plan.");
        } else if (errBody.error?.code === "RATE_LIMITED") {
          setError("Trop de soumissions, réessaie plus tard.");
        } else {
          setError(errBody.error?.message ?? "Soumission impossible.");
        }
        return;
      }

      setDone(true);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p className="bg-white border border-bordure rounded-xl p-5 text-center font-bold">
        Merci ! Ton bon plan est envoyé, il sera visible après validation.
      </p>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="bg-white border border-bordure rounded-xl p-5 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-bold">
        Titre
        <input name="titre" required minLength={3} maxLength={200} className="border border-bordure rounded px-3 py-2 font-normal" />
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Enseigne (facultatif)
        <select name="enseigneSlug" className="border border-bordure rounded px-3 py-2 font-normal">
          <option value="">— Aucune enseigne —</option>
          {enseignes.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.nom}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Type
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="border border-bordure rounded px-3 py-2 font-normal"
        >
          <option value="physique">En magasin</option>
          <option value="en_ligne">En ligne</option>
          <option value="les_deux">Les deux</option>
        </select>
      </label>

      {type !== "en_ligne" && (
        <label className="flex flex-col gap-1 text-sm font-bold">
          Ville
          <select name="ville" className="border border-bordure rounded px-3 py-2 font-normal">
            <option value="">— non précisé —</option>
            {VILLES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}

      {type !== "physique" && (
        <label className="flex flex-col gap-1 text-sm font-bold">
          Lien de l&apos;offre
          <input name="lien" type="url" required className="border border-bordure rounded px-3 py-2 font-normal" />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm font-bold">
        Catégorie
        <select name="categorie" required className="border border-bordure rounded px-3 py-2 font-normal">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-3">
        <label className="flex-1 min-w-0 flex flex-col gap-1 text-sm font-bold">
          Prix promo (DH)
          <input
            name="prixPromo"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="w-full min-w-0 border border-bordure rounded px-3 py-2 font-normal"
          />
        </label>
        <label className="flex-1 min-w-0 flex flex-col gap-1 text-sm font-bold">
          Prix normal (DH)
          <input
            name="prixNormal"
            type="number"
            step="0.01"
            min="0.01"
            className="w-full min-w-0 border border-bordure rounded px-3 py-2 font-normal"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Fin de l&apos;offre
        <input name="dateFin" type="date" className="border border-bordure rounded px-3 py-2 font-normal" />
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Description
        <textarea name="description" maxLength={2000} rows={3} className="border border-bordure rounded px-3 py-2 font-normal" />
      </label>

      <div className="cf-turnstile" data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />

      <button
        type="submit"
        disabled={pending}
        className="self-start bg-rouge text-white rounded-lg px-5 py-2 font-bold disabled:opacity-50"
      >
        Envoyer
      </button>
      {error && <p className="text-sm text-rouge">{error}</p>}
    </form>
  );
}
