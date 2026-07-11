import { AuthError, type AuthUser } from "@fidwastafid/schemas";

export function assertUser(user: AuthUser | null): AuthUser {
  if (!user) throw new AuthError("UNAUTHENTICATED");
  return user;
}

/** CONTRAT-V1 §5 : requireAdmin ne distingue pas non-authentifié / non-admin — toujours FORBIDDEN. */
export function assertAdmin(user: AuthUser | null): AuthUser {
  if (!user || !user.isAdmin) throw new AuthError("FORBIDDEN");
  return user;
}
