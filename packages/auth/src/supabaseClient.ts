import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Clé publique (publishable, pas secrète) : `auth.getUser(token)` se contente
 * de vérifier le JWT passé, aucune élévation de privilège nécessaire ici
 * (principe de moindre privilège — plan v2, principes non négociables §7).
 * Le reste (public_id, isAdmin) se résout via packages/db, jamais via
 * PostgREST/Supabase. `createClient()` ne change pas de signature entre
 * clé publishable et clé anon legacy — seule la valeur change.
 */
function readSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_URL manquant. packages/auth vérifie les sessions via Supabase Auth.");
  }
  return url;
}

/**
 * Fallback transitoire sur l'ancienne clé `anon` (JWT) tant que les clés
 * legacy ne sont pas désactivées côté Dashboard Supabase — les deux
 * cohabitent nativement le temps de la migration.
 */
function readSupabaseKey(): string {
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (publishableKey) return publishableKey;

  const legacyKey = process.env.SUPABASE_ANON_KEY;
  if (!legacyKey) {
    throw new Error(
      "SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY en fallback) manquant. packages/auth vérifie les sessions via Supabase Auth."
    );
  }
  console.warn(
    "[supabase-keys] SUPABASE_PUBLISHABLE_KEY absent — fallback sur SUPABASE_ANON_KEY (legacy). " +
      "À retirer après migration complète (voir docs/MIGRATION-CLES-SUPABASE.md)."
  );
  return legacyKey;
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(readSupabaseUrl(), readSupabaseKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Réservé aux tests — force la recréation du client au prochain appel. */
export function resetSupabaseClientForTests(): void {
  client = null;
}
