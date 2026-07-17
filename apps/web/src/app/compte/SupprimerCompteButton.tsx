"use client";

import { useState } from "react";
import { deconnexionApresSuppressionAction } from "./actions.js";

type Etape = "repos" | "confirmation" | "pending";

/**
 * Confirmation en deux temps : le bouton révèle un encart listant les
 * conséquences EXACTES avant tout appel réseau — jamais de suppression sur
 * un simple clic. Après un DELETE réussi, la déconnexion (cookie httpOnly,
 * illisible en JS client) passe par une Server Action dédiée (./actions.ts).
 */
export function SupprimerCompteButton() {
  const [etape, setEtape] = useState<Etape>("repos");
  const [erreur, setErreur] = useState<string | null>(null);

  async function confirmerSuppression() {
    setEtape("pending");
    setErreur(null);
    try {
      const res = await fetch("/api/v1/me", { method: "DELETE" });
      if (!res.ok) {
        setErreur("Suppression impossible pour le moment. Réessaie plus tard.");
        setEtape("confirmation");
        return;
      }
      await deconnexionApresSuppressionAction();
    } catch {
      setErreur("Suppression impossible pour le moment. Réessaie plus tard.");
      setEtape("confirmation");
    }
  }

  if (etape === "repos") {
    return (
      <button
        type="button"
        onClick={() => setEtape("confirmation")}
        className="bg-white border-2 border-rouge text-rouge rounded-lg px-4 py-2 text-sm font-bold hover:bg-rouge hover:text-white transition-colors"
      >
        Supprimer mon compte
      </button>
    );
  }

  const pending = etape === "pending";

  return (
    <div className="bg-creme border border-rouge/30 rounded-xl p-4 flex flex-col gap-3">
      <p className="text-sm font-bold text-texte">Cette action est définitive :</p>
      <ul className="text-sm text-muted list-disc pl-5 flex flex-col gap-1">
        <li>Tes commentaires resteront visibles mais deviendront anonymes (&laquo;&nbsp;Membre supprimé&nbsp;&raquo;).</li>
        <li>Tes deals déjà publiés resteront en ligne, mais sans attribution à ton compte.</li>
        <li>Tu perdras définitivement l&apos;accès à ce compte — impossible à annuler.</li>
      </ul>
      {erreur && <p className="text-sm text-rouge font-bold">{erreur}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEtape("repos")}
          disabled={pending}
          className="text-sm font-bold text-muted underline disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => void confirmerSuppression()}
          disabled={pending}
          className="ml-auto bg-rouge text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {pending ? "Suppression..." : "Confirmer la suppression définitive"}
        </button>
      </div>
    </div>
  );
}
