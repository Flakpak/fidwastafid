import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase dédié aux actions de connexion/inscription — distinct de
 * packages/auth, qui ne fait que VÉRIFIER un JWT entrant (CONTRAT-V1 §5 :
 * "rien d'autre ne sort du module"). Se connecter/s'inscrire est une action
 * du web, pas une responsabilité du module de vérification.
 */
function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} manquant.`);
  }
  return value;
}

/**
 * Fallback transitoire sur l'ancienne clé `anon` (JWT) tant que les clés
 * legacy ne sont pas désactivées côté Dashboard Supabase — mêmes clés que
 * packages/auth/src/supabaseClient.ts, dupliqué ici volontairement (pas de
 * dépendance croisée entre ce module web et le package auth, qui ne fait
 * que vérifier des JWT entrants, CONTRAT-V1 §5).
 */
function readSupabaseKey(): string {
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (publishableKey) return publishableKey;

  const legacyKey = process.env.SUPABASE_ANON_KEY;
  if (!legacyKey) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY en fallback) manquant.");
  }
  console.warn(
    "[supabase-keys] SUPABASE_PUBLISHABLE_KEY absent — fallback sur SUPABASE_ANON_KEY (legacy). " +
      "À retirer après migration complète (voir docs/MIGRATION-CLES-SUPABASE.md)."
  );
  return legacyKey;
}

export function getAuthClient() {
  return createClient(readEnv("SUPABASE_URL"), readSupabaseKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Change le mot de passe de l'utilisateur identifié par `accessToken` —
 * fetch nu vers l'API REST Supabase Auth plutôt que `getAuthClient().auth.updateUser()` :
 * ce client est stateless (`persistSession: false`), `updateUser()` opère
 * sur la session interne du client (`this.currentSession`), qu'on n'a
 * jamais hydratée ici — il n'y a pas d'API du SDK pour lui passer un
 * access token à la volée pour cet appel précis. `PUT /auth/v1/user` avec
 * `Authorization: Bearer <access_token>` est le même endpoint que le SDK
 * appelle en interne, donc un comportement identique sans ce détour.
 */
export async function updateUserPassword(accessToken: string, password: string): Promise<boolean> {
  const response = await fetch(`${readEnv("SUPABASE_URL")}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: readSupabaseKey(),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  return response.ok;
}
