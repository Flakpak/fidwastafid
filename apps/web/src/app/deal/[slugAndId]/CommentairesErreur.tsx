"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * État d'échec du chargement des commentaires — le pendant honnête de
 * l'ancien `return []`, qui affichait « Commentaires (0) » sur un deal qui en
 * avait. Un compteur à zéro est un fait ; un échec de chargement n'en est pas
 * un, et les deux ne doivent jamais se ressembler.
 *
 * La reprise passe par `router.refresh()` : la page est un composant serveur,
 * c'est lui qui refait l'appel. Même geste que CommentForm après publication.
 */
export function CommentairesErreur() {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  return (
    <div
      role="alert"
      className="bg-surface border border-warn/40 rounded-xl p-4 flex flex-col items-center gap-2 text-sm"
    >
      <p className="text-warn font-bold text-center">
        Les commentaires n&apos;ont pas pu être chargés. Ils existent peut-être — c&apos;est l&apos;affichage qui a
        échoué, pas la discussion.
      </p>
      <button
        type="button"
        onClick={() => {
          setEnCours(true);
          router.refresh();
          // Pas de callback de fin sur refresh() : on relâche le bouton après
          // le rendu serveur suivant, au pire au bout d'une seconde — mieux
          // vaut un bouton re-cliquable qu'un bouton bloqué si rien ne change.
          setTimeout(() => setEnCours(false), 1000);
        }}
        disabled={enCours}
        className="rounded-full border border-border-strong bg-surface px-4 py-2 text-xs font-bold text-ink hover:bg-surface-subtle disabled:opacity-50"
      >
        Réessayer
      </button>
    </div>
  );
}
