import { cache } from "react";
import { headers } from "next/headers";
import { getCurrentUser, type AuthUser } from "@fidwastafid/auth";

/**
 * Résout l'utilisateur courant pour la garde serveur /admin/* — appelée à
 * la fois par le layout et par chaque page (App Router : layout et page se
 * rendent en parallèle, une garde de layout seule n'empêche pas l'émission
 * du payload RSC de la page, voir CONTRAT-V1 §5). `cache()` dédupe cette
 * résolution par requête : un seul appel réseau/DB même si layout + page
 * l'appellent tous les deux.
 *
 * N'adapte que l'entrée de `getCurrentUser()` (Request synthétique depuis
 * `headers()`, pattern déjà utilisé ailleurs dans apps/web pour appeler des
 * route handlers directement) — packages/auth reste inchangé.
 */
export const resolveAdminGuardUser = cache(async (): Promise<AuthUser | null> => {
  const request = new Request("http://localhost/admin", { headers: await headers() });
  return getCurrentUser(request);
});
