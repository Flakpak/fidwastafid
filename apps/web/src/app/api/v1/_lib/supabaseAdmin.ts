/**
 * Opérations Supabase Auth Admin — fetch nu, service role, même approche
 * sans SDK que la route proxy d'image (apps/web/src/app/img/deals/[publicId]/route.ts,
 * CONTRAT-V1 §6) : LE point à réécrire le jour d'un changement de backend
 * auth. Réservé à /api/v1/me (lecture de l'email, suppression de compte) —
 * jamais appelé depuis packages/auth, qui ne fait que VÉRIFIER un JWT
 * entrant (CONTRAT-V1 §5, interface figée, aucune opération d'écriture).
 */

/**
 * Nouvelles clés Supabase (sb_secret_...) : header `apikey` uniquement,
 * jamais `Authorization: Bearer` — ce ne sont pas des JWT, un envoi en
 * Bearer est rejeté (doc Supabase, migration des clés API, 18/07/2026).
 * Fallback transitoire sur l'ancienne `service_role` (JWT) tant que les
 * clés legacy ne sont pas désactivées côté Dashboard Supabase — on garde
 * pour ce cas précis le pattern apikey+Authorization historique, qui reste
 * ce que GoTrue attend d'une clé JWT legacy.
 */
function adminHeaders(): HeadersInit {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (secretKey) return { apikey: secretKey };

  const legacyKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!legacyKey) throw new Error("SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY en fallback) manquant.");
  console.warn(
    "[supabase-keys] SUPABASE_SECRET_KEY absent — fallback sur SUPABASE_SERVICE_ROLE_KEY (legacy). " +
      "À retirer après migration complète (voir docs/MIGRATION-CLES-SUPABASE.md)."
  );
  return { apikey: legacyKey, Authorization: `Bearer ${legacyKey}` };
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
