import type { AuthUser } from "@fidwastafid/schemas";
import { extractSessionToken } from "./token.js";
import { resolveAuthUser } from "./resolveUser.js";
import { assertUser, assertAdmin } from "./guards.js";

export type { AuthUser } from "@fidwastafid/schemas";
export { AuthError } from "@fidwastafid/schemas";

/**
 * Interface figée — CONTRAT-V1 §5. Rien d'autre ne sort du module (pas de
 * hasVoted(), pas de profil étendu) et il n'est appelé que depuis /api/v1,
 * jamais directement par un composant web ou le pipeline.
 */

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  const token = extractSessionToken(request);
  if (!token) return null;
  return resolveAuthUser(token);
}

export async function requireUser(request: Request): Promise<AuthUser> {
  return assertUser(await getCurrentUser(request));
}

export async function requireAdmin(request: Request): Promise<AuthUser> {
  return assertAdmin(await getCurrentUser(request));
}
