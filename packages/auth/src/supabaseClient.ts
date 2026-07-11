import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Clé anonyme, pas la service role : `auth.getUser(token)` se contente de
 * vérifier le JWT passé, aucune élévation de privilège nécessaire ici
 * (principe de moindre privilège — plan v2, principes non négociables §7).
 * Le reste (public_id, isAdmin) se résout via packages/db, jamais via
 * PostgREST/Supabase.
 */
function readSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_URL manquant. packages/auth vérifie les sessions via Supabase Auth.");
  }
  return url;
}

function readSupabaseAnonKey(): string {
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error("SUPABASE_ANON_KEY manquant. packages/auth vérifie les sessions via Supabase Auth.");
  }
  return key;
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(readSupabaseUrl(), readSupabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Réservé aux tests — force la recréation du client au prochain appel. */
export function resetSupabaseClientForTests(): void {
  client = null;
}
