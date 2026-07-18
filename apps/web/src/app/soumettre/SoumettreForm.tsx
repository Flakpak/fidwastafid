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

/** Sentinel du <select> enseigne — jamais un vrai slug (CONTRAT-V1 §3,
 *  amendement du 18/07/2026) : distingue "aucune enseigne" (rien de plus)
 *  d'"autre commerce" (révèle nomVendeur). Jamais envoyé à l'API telle
 *  quelle — traduite en enseigneSlug: undefined au submit, comme "". */
const AUTRE_COMMERCE = "__autre__";

// Champs de formulaire uniquement (jamais le token Turnstile, à usage
// unique et sans intérêt à survivre) — sessionStorage, jamais localStorage :
// le brouillon n'a de sens que pour l'aller-retour connexion de cette
// session d'onglet, pas au-delà. `enseigneSlug` et `type` sont exclus (state
// React dédié, restaurés séparément — cf. effet de restauration) ;
// `whatsappPublic` (checkbox) est géré à part (`.checked`, pas `.value`).
const DRAFT_TEXT_FIELDS = [
  "titre",
  "nomVendeur",
  "ville",
  "lien",
  "adresse",
  "lienMaps",
  "whatsappContact",
  "categorie",
  "prixPromo",
  "prixNormal",
  "dateFin",
  "description",
] as const;
const DRAFT_KEY = "soumettre:brouillon";

export function SoumettreForm({ enseignes }: { enseignes: Enseigne[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const draftRef = useRef<Record<string, string> | null>(null);
  const [type, setType] = useState<"physique" | "en_ligne" | "les_deux">("physique");
  const [enseigneSlug, setEnseigneSlug] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<SubmitError | null>(null);
  const [done, setDone] = useState(false);
  const [restoredOnce, setRestoredOnce] = useState(false);

  // Restauration du brouillon au montage — deux passes : `type` et
  // `enseigneSlug` pilotent l'affichage conditionnel (ville/lien, nomVendeur),
  // donc les valeurs qui en dépendent ne peuvent être posées qu'une fois le
  // DOM correspondant effectivement rendu (cf. effet suivant, déclenché
  // après ce commit).
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
        if (typeof draft.enseigneSlug === "string") {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setEnseigneSlug(draft.enseigneSlug);
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
      if (name === "type" || name === "enseigneSlug") continue;
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement && field.type === "checkbox") {
        field.checked = value === "1";
      } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        field.value = value;
      }
    }
    draftRef.current = null;
  }, [restoredOnce, type, enseigneSlug]);

  function saveDraft() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const draft: Record<string, string> = {};
    for (const field of DRAFT_TEXT_FIELDS) {
      const value = data.get(field);
      if (typeof value === "string" && value) draft[field] = value;
    }
    draft.type = type;
    draft.enseigneSlug = enseigneSlug;
    const whatsappPublicField = form.elements.namedItem("whatsappPublic");
    if (whatsappPublicField instanceof HTMLInputElement) {
      draft.whatsappPublic = whatsappPublicField.checked ? "1" : "";
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

    const ville = data.get("ville");
    const prixNormal = data.get("prixNormal");
    const dateFin = data.get("dateFin");
    const description = data.get("description");
    const lien = data.get("lien");
    const nomVendeur = data.get("nomVendeur");
    const adresse = data.get("adresse");
    const lienMaps = data.get("lienMaps");
    const whatsappContact = data.get("whatsappContact");
    const whatsappPublic = data.get("whatsappPublic") === "on";

    // Règle croisée (CONTRAT-V1 §3/§4, amendement du 18/07/2026) — vérifiée
    // aussi côté client : le serveur la revérifiera de toute façon (jamais
    // la seule ligne de défense), mais un aller-retour réseau pour ça serait
    // une erreur évitable.
    if (whatsappPublic && !whatsappContact) {
      setError({ message: "Indique un numéro WhatsApp pour autoriser son affichage public." });
      setPending(false);
      return;
    }

    const body = {
      titre: String(data.get("titre") ?? ""),
      enseigneSlug: enseigneSlug && enseigneSlug !== AUTRE_COMMERCE ? enseigneSlug : undefined,
      nomVendeur: enseigneSlug === AUTRE_COMMERCE && nomVendeur ? String(nomVendeur) : undefined,
      adresse: adresse ? String(adresse) : undefined,
      lienMaps: lienMaps ? String(lienMaps) : undefined,
      ville: ville ? String(ville) : undefined,
      categorie: String(data.get("categorie") ?? ""),
      type,
      prixPromo: Number(data.get("prixPromo")),
      prixNormal: prixNormal ? Number(prixNormal) : undefined,
      dateFin: dateFin ? String(dateFin) : undefined,
      description: description ? String(description) : undefined,
      lien: lien ? String(lien) : undefined,
      whatsappContact: whatsappContact ? String(whatsappContact) : undefined,
      whatsappPublic,
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
      {/* Charte de publication — encart court, en tête du formulaire. */}
      <div className="bg-creme border border-bordure rounded-lg p-3 text-xs text-muted leading-relaxed">
        <p>
          <strong className="text-texte">Charte de publication :</strong> un bon plan = une offre d&apos;un
          commerce, accessible à tous au même prix. Pas de vente entre particuliers, pas d&apos;annonces
          personnelles. Les deals sont validés par la modération avant publication.{" "}
          <Link href="/charte" className="text-bleu font-bold hover:underline">
            Lire la charte complète
          </Link>
          .
        </p>
      </div>

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
        <select
          name="enseigneSlug"
          value={enseigneSlug}
          onChange={(e) => setEnseigneSlug(e.target.value)}
          className="border border-bordure rounded px-3 py-2 font-normal"
        >
          <option value="">— Aucune enseigne —</option>
          <option value={AUTRE_COMMERCE}>Autre commerce (hanout, marché, boutique...)</option>
          {enseignes.map((e) => (
            <option key={e.slug} value={e.slug}>
              {e.nom}
            </option>
          ))}
        </select>
      </label>

      {enseigneSlug === AUTRE_COMMERCE && (
        <label className="flex flex-col gap-1 text-sm font-bold">
          Nom du commerce
          <input
            name="nomVendeur"
            maxLength={80}
            placeholder="ex. : Hanout Si Mohamed"
            className="border border-bordure rounded px-3 py-2 font-normal"
          />
        </label>
      )}

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

      {type !== "en_ligne" && (
        <div className="border border-bordure rounded-lg p-3 flex flex-col gap-3">
          <p className="text-sm font-black">Où trouver ce bon plan ?</p>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Adresse ou repère (facultatif)
            <input
              name="adresse"
              maxLength={200}
              placeholder="ex. : marché Derb Ghallef, allée 3"
              className="border border-bordure rounded px-3 py-2 font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Lien Google Maps (facultatif)
            <input
              name="lienMaps"
              type="url"
              placeholder="https://maps.app.goo.gl/..."
              className="border border-bordure rounded px-3 py-2 font-normal"
            />
            <span className="text-xs text-muted font-normal">Depuis Maps : Partager → Copier le lien.</span>
          </label>
        </div>
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

      <div className="border border-bordure rounded-lg p-3 flex flex-col gap-3">
        <p className="text-sm font-black">Contact vendeur (facultatif)</p>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Numéro WhatsApp du vendeur
          <input
            name="whatsappContact"
            type="tel"
            placeholder="0612345678 ou +212612345678"
            className="border border-bordure rounded px-3 py-2 font-normal"
          />
        </label>
        <label className="flex items-start gap-2 text-sm font-normal">
          <input type="checkbox" name="whatsappPublic" className="mt-0.5" />
          <span>
            J&apos;autorise l&apos;affichage public de ce numéro sur le deal (sinon il reste visible uniquement
            par la modération).
          </span>
        </label>
      </div>

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
