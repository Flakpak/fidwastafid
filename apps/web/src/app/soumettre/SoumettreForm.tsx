"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { VILLES, CATEGORIES, type Enseigne } from "@fidwastafid/schemas";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

interface SubmitError {
  message: string;
  unauthenticated?: boolean;
}

declare global {
  interface Window {
    turnstile?: { reset: (widgetId?: string) => void };
  }
}

// Champs de formulaire uniquement (jamais le token Turnstile, à usage
// unique et sans intérêt à survivre) — sessionStorage, jamais localStorage :
// le brouillon n'a de sens que pour l'aller-retour connexion de cette
// session d'onglet, pas au-delà.
const DRAFT_KEY = "soumettre:brouillon";
const DRAFT_FIELDS = [
  "titre",
  "enseigneSlug",
  "type",
  "ville",
  "lien",
  "categorie",
  "prixPromo",
  "prixNormal",
  "dateFin",
  "description",
] as const;

export function SoumettreForm({ enseignes }: { enseignes: Enseigne[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef<Record<string, string> | null>(null);
  const [type, setType] = useState<"physique" | "en_ligne" | "les_deux">("physique");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SubmitError | null>(null);
  const [done, setDone] = useState(false);
  const [restoredOnce, setRestoredOnce] = useState(false);

  // Restauration du brouillon au montage — deux passes : `type` pilote
  // l'affichage conditionnel des champs ville/lien, donc les valeurs qui en
  // dépendent ne peuvent être posées qu'une fois le DOM correspondant au
  // type restauré effectivement rendu (cf. effet suivant, déclenché par
  // `type` après ce commit).
  useEffect(() => {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      try {
        const draft = JSON.parse(raw) as Record<string, string>;
        draftRef.current = draft;
        if (draft.type === "physique" || draft.type === "en_ligne" || draft.type === "les_deux") {
          // Lecture d'un store externe (sessionStorage, inexistant en SSR) —
          // ne peut pas se faire pendant le rendu sans provoquer un mismatch
          // d'hydratation (cf. commentaire ci-dessus) ; ce setState post-montage
          // est donc voulu, pas un raccourci.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setType(draft.type);
        }
      } catch {
        // Brouillon corrompu — ignoré, formulaire vierge.
      }
    }
    setRestoredOnce(true);
  }, []);

  useEffect(() => {
    if (!restoredOnce || !draftRef.current) return;
    const form = formRef.current;
    if (!form) return;
    for (const [name, value] of Object.entries(draftRef.current)) {
      if (name === "type") continue;
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        field.value = value;
      }
    }
    draftRef.current = null;
  }, [restoredOnce, type]);

  function saveDraft() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const draft: Record<string, string> = {};
    for (const field of DRAFT_FIELDS) {
      const value = data.get(field);
      if (typeof value === "string" && value) draft[field] = value;
    }
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

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
        // Le token Turnstile est à usage unique et déjà consommé par cet essai
        // (succès ou échec côté serveur) — sans reset, le prochain essai part
        // avec un token périmé et échoue à la vérification anti-robot, quelle
        // que soit la cause du premier échec.
        window.turnstile?.reset();
        let message = "Soumission impossible.";
        let unauthenticated = false;
        try {
          const errBody = (await res.json()) as ApiErrorBody;
          if (errBody.error?.code === "UNAUTHENTICATED") {
            message = "Connecte-toi pour proposer un bon plan.";
            unauthenticated = true;
          } else if (errBody.error?.code === "RATE_LIMITED") {
            message = "Trop de soumissions, réessaie plus tard.";
          } else if (errBody.error?.message) {
            message = errBody.error.message;
          }
        } catch {
          // Réponse d'erreur non structurée (ex. 500 hors format API) — le
          // message générique reste affiché plutôt que de rester silencieux.
        }
        setError({ message, unauthenticated });
        return;
      }

      sessionStorage.removeItem(DRAFT_KEY);
      setDone(true);
      router.refresh();
    } catch {
      window.turnstile?.reset();
      setError({ message: "Soumission impossible, réessaie." });
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
    <form
      ref={formRef}
      onSubmit={submit}
      onChange={saveDraft}
      className="bg-white border border-bordure rounded-xl p-5 flex flex-col gap-3"
    >
      {error && (
        <div role="alert" className="bg-white border border-rouge/40 rounded-lg p-3 flex flex-col gap-2 text-sm">
          <p className="text-rouge font-bold">{error.message}</p>
          {error.unauthenticated && (
            <div className="flex gap-4 font-bold">
              <Link href="/connexion?next=/soumettre" className="text-bleu hover:underline">
                Se connecter
              </Link>
              <Link href="/inscription?next=/soumettre" className="text-bleu hover:underline">
                Créer un compte
              </Link>
            </div>
          )}
        </div>
      )}

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
    </form>
  );
}
