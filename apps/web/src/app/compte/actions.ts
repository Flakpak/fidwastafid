"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME } from "@fidwastafid/auth";

/**
 * Déconnexion + message, appelée après un DELETE /api/v1/me réussi
 * (SupprimerCompteButton, client) — pas deconnexionAction (lib/authActions.ts) :
 * même logique de nettoyage du cookie (httpOnly, illisible/effaçable en JS
 * client, doit passer par une Server Action), mais une redirection avec
 * message dédiée plutôt que de faire porter ce cas particulier par l'action
 * partagée du header/formulaire de connexion.
 */
export async function deconnexionApresSuppressionAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  redirect("/?compte=supprime");
}
