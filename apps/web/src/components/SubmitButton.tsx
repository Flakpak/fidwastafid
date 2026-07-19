"use client";

import { useFormStatus } from "react-dom";

/**
 * Bouton de soumission pour un <form action={serverAction}> — `useFormStatus`
 * n'expose `pending` qu'à un composant ENFANT du <form>, jamais au composant
 * qui rend le <form> lui-même (d'où ce composant séparé plutôt qu'un simple
 * state local sur les pages connexion/inscription/mot-de-passe-oublie/
 * réinitialisation, qui restent des Server Components).
 *
 * Empêche le double-submit (incident du 19/07/2026 : un formulaire muet sur
 * erreur pousse l'utilisateur à marteler le bouton) — désactivé + libellé
 * "en cours" pendant la requête, comme les formulaires client (fetch) du site.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className ?? ""} disabled:opacity-50`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
