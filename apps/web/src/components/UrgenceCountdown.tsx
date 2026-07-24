"use client";

import { useEffect, useState } from "react";

/** "XjXh", repli minutes en toute fin de compte à rebours — pas besoin des secondes. */
function formatRestant(diffMs: number): string {
  const totalMin = Math.max(0, Math.floor(diffMs / 60_000));
  const jours = Math.floor(totalMin / 1440);
  const heures = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (jours > 0) return `${jours}j${heures}h`;
  if (heures > 0) return `${heures}h`;
  return `${minutes}min`;
}

/**
 * Compte à rebours live pour un deal qui expire sous 48h — composant
 * client minimal et isolé (le reste de DealCard reste serveur). `dateFin`
 * n'a pas d'heure (colonne DATE) : on considère le deal valable jusqu'à la
 * fin de ce jour-là (23:59:59), cohérent avec "Valable jusqu'au {date}"
 * affiché ailleurs (page deal).
 *
 * Rien n'est rendu avant montage (diffMs reste null) : calculer `Date.now()`
 * dès le rendu initial produirait une valeur SSR figée à l'instant de la
 * requête puis une valeur client légèrement différente à l'hydratation —
 * un mismatch bénin mais évitable, même pattern que HeroArabicTypewriter.
 */
export function UrgenceCountdown({ dateFin }: { dateFin: string }) {
  const [diffMs, setDiffMs] = useState<number | null>(null);

  useEffect(() => {
    function tick() {
      setDiffMs(new Date(`${dateFin}T23:59:59`).getTime() - Date.now());
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [dateFin]);

  if (diffMs === null) return null;

  if (diffMs <= 0) {
    return <span className="text-xs font-bold bg-cold-soft text-cold rounded-full px-2.5 py-1">Expiré</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold bg-warn-soft text-warn rounded-full px-2.5 py-1">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" className="h-3 w-3">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      Expire dans {formatRestant(diffMs)}
    </span>
  );
}
