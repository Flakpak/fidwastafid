/**
 * Opérations Supabase Auth Admin — fetch nu, service role, même approche
 * sans SDK que la route proxy d'image (apps/web/src/app/img/deals/[publicId]/route.ts,
 * CONTRAT-V1 §6) : LE point à réécrire le jour d'un changement de backend
 * auth. Réservé à /api/v1/me (lecture de l'email, suppression de compte) —
 * jamais appelé depuis packages/auth, qui ne fait que VÉRIFIER un JWT
 * entrant (CONTRAT-V1 §5, interface figée, aucune opération d'écriture).
 */

function adminHeaders(): HeadersInit {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquant.");
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/** GET /api/v1/me — l'email ne vit que dans Supabase Auth, jamais dupliqué dans public.users. */
export async function fetchAuthUserEmail(userId: string): Promise<string | null> {
  const url = `${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}`;
  const response = await fetch(url, { headers: adminHeaders() });
  if (!response.ok) return null;
  const body = (await response.json()) as { email?: string };
  return body.email ?? null;
}

/** DELETE /api/v1/me — dernière étape de la suppression de compte. */
export async function deleteAuthUser(userId: string): Promise<boolean> {
  const url = `${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}`;
  const response = await fetch(url, { method: "DELETE", headers: adminHeaders() });
  return response.ok;
}
