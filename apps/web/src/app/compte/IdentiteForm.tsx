"use client";

import { useState, type FormEvent } from "react";
import type { CouleurAvatar } from "@fidwastafid/schemas";
import { Avatar, AVATAR_BG_CLASS } from "../../components/Avatar.js";

const COULEURS: CouleurAvatar[] = ["rouge", "terracotta", "or", "olive", "bleu", "indigo", "prune", "ardoise"];

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

interface IdentiteFormProps {
  pseudoInitial: string;
  couleurInitiale: CouleurAvatar;
}

/**
 * Pseudo (formulaire + bouton Enregistrer) et couleur d'avatar (pastilles,
 * PATCH immédiat au clic) — un seul composant client : les deux mutent la
 * même ressource (PATCH /api/v1/me) et partagent l'avatar affiché en tête.
 */
export function IdentiteForm({ pseudoInitial, couleurInitiale }: IdentiteFormProps) {
  const [pseudo, setPseudo] = useState(pseudoInitial);
  const [couleur, setCouleur] = useState(couleurInitiale);
  const [pendingPseudo, setPendingPseudo] = useState(false);
  const [pendingCouleur, setPendingCouleur] = useState<CouleurAvatar | null>(null);
  const [erreurPseudo, setErreurPseudo] = useState<string | null>(null);
  const [succesPseudo, setSuccesPseudo] = useState(false);
  const [erreurCouleur, setErreurCouleur] = useState<string | null>(null);

  async function enregistrerPseudo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPendingPseudo(true);
    setErreurPseudo(null);
    setSuccesPseudo(false);
    try {
      const res = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pseudo }),
      });
      const body = (await res.json()) as ApiErrorBody & { pseudo?: string };
      if (!res.ok) {
        setErreurPseudo(body.error?.code === "VALIDATION_ERROR" ? body.error.message ?? "Pseudo invalide." : "Modification impossible.");
        return;
      }
      if (body.pseudo) setPseudo(body.pseudo);
      setSuccesPseudo(true);
    } catch {
      setErreurPseudo("Modification impossible, réessaie.");
    } finally {
      setPendingPseudo(false);
    }
  }

  async function choisirCouleur(c: CouleurAvatar) {
    if (c === couleur || pendingCouleur) return;
    setPendingCouleur(c);
    setErreurCouleur(null);
    try {
      const res = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couleurAvatar: c }),
      });
      if (res.ok) {
        setCouleur(c);
      } else {
        setErreurCouleur("Changement de couleur impossible.");
      }
    } catch {
      setErreurCouleur("Changement de couleur impossible, réessaie.");
    } finally {
      setPendingCouleur(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar pseudo={pseudo} couleurAvatar={couleur} size="xl" />
        <p className="font-black text-xl text-texte">{pseudo}</p>
      </div>

      <form onSubmit={(e) => void enregistrerPseudo(e)} className="flex flex-col gap-2">
        <label htmlFor="pseudo" className="text-sm font-bold text-muted">
          Pseudo
        </label>
        <div className="flex gap-2">
          <input
            id="pseudo"
            value={pseudo}
            onChange={(e) => {
              setPseudo(e.target.value);
              setSuccesPseudo(false);
            }}
            required
            maxLength={40}
            className="flex-1 border border-bordure rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pendingPseudo}
            className="bg-rouge text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
          >
            {pendingPseudo ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
        {erreurPseudo && <p className="text-sm text-rouge">{erreurPseudo}</p>}
        {succesPseudo && <p className="text-sm text-vert font-semibold">Pseudo mis à jour.</p>}
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-bold text-muted">Couleur d&apos;avatar</p>
        <div className="flex gap-2 flex-wrap">
          {COULEURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void choisirCouleur(c)}
              disabled={pendingCouleur !== null}
              aria-label={c}
              aria-pressed={c === couleur}
              className={`w-8 h-8 rounded-full ${AVATAR_BG_CLASS[c]} disabled:opacity-50 ${
                c === couleur ? "ring-2 ring-offset-2 ring-texte" : ""
              }`}
            />
          ))}
        </div>
        {erreurCouleur && <p className="text-sm text-rouge">{erreurCouleur}</p>}
      </div>
    </div>
  );
}
