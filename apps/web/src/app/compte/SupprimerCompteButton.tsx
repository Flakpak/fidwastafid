"use client";

import { useState } from "react";
import { deconnexionApresSuppressionAction } from "./actions.js";
import { Button } from "../../components/Button.js";

type Etape = "repos" | "confirmation" | "pending";

/**
 * Confirmation en deux temps : le bouton révèle un encart listant les
 * conséquences EXACTES avant tout appel réseau — jamais de suppression sur
 * un simple clic. Après un DELETE réussi, la déconnexion (cookie httpOnly,
 * illisible en JS client) passe par une Server Action dédiée (./actions.ts).
 *
 * Charte Tadelakt (CONTRAT-V1 §8) : action destructive = variante `danger`
 * (contour braise, jamais un aplat alarmiste).
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
      <Button variant="danger" onClick={() => setEtape("confirmation")} className="self-start">
        Supprimer mon compte
      </Button>
    );
  }

  const pending = etape === "pending";

  return (
    <div className="bg-hot-soft border border-hot/30 rounded-xl p-4 flex flex-col gap-3">
      <p className="text-sm font-bold text-ink">Cette action est définitive :</p>
      <ul className="text-sm text-ink-muted list-disc pl-5 flex flex-col gap-1">
        <li>Tes commentaires resteront visibles mais deviendront anonymes (&laquo;&nbsp;Membre supprimé&nbsp;&raquo;).</li>
        <li>Tes deals déjà publiés resteront en ligne, mais sans attribution à ton compte.</li>
        <li>Tu perdras définitivement l&apos;accès à ce compte — impossible à annuler.</li>
      </ul>
      {erreur && <p className="text-sm text-warn font-bold">{erreur}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEtape("repos")}
          disabled={pending}
          className="text-sm font-bold text-ink-muted hover:text-ink underline disabled:opacity-50"
        >
          Annuler
        </button>
        <Button
          variant="danger"
          onClick={() => void confirmerSuppression()}
          disabled={pending}
          className="ml-auto"
        >
          {pending ? "Suppression..." : "Confirmer la suppression définitive"}
        </Button>
      </div>
    </div>
  );
}
