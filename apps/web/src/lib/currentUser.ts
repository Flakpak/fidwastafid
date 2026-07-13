import { cache } from "react";
import { headers } from "next/headers";
import { getCurrentUser, type AuthUser } from "@fidwastafid/auth";

/**
 * Résout l'utilisateur courant côté serveur — utilisé par la garde /admin/*
 * (layout, page, generateMetadata) ET par SiteHeader (état connecté/pseudo/
 * lien admin). `cache()` dédupe la résolution par requête : que ce soit 1
 * ou 4 appelants sur la même page, un seul appel réseau/DB.
 *
 * N'adapte que l'entrée de `getCurrentUser()` (Request synthétique depuis
 * `headers()`, pattern déjà utilisé ailleurs dans apps/web pour appeler des
 * route handlers directement) — packages/auth reste inchangé.
 */
export const resolveCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const request = new Request("http://localhost/", { headers: await headers() });
  return getCurrentUser(request);
});
