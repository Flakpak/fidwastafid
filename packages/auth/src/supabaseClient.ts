import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Clé publique (publishable, pas secrète) : `auth.getUser(token)` se contente
 * de vérifier le JWT passé, aucune élévation de privilège nécessaire ici
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

/**
 * Migration des clés API Supabase terminée (19/07/2026, voir
 * docs/MIGRATION-CLES-SUPABASE.md) — les clés legacy (`anon`/`service_role`)
 * sont désactivées côté Dashboard Supabase et ne sont plus provisionnées
 * nulle part (Vercel, CI, fichiers locaux). Plus de fallback : un
 * SUPABASE_PUBLISHABLE_KEY manquant est une erreur de configuration à
 * corriger, pas un cas à absorber silencieusement.
 */
function readSupabasePublishableKey(): string {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY manquant. packages/auth vérifie les sessions via Supabase Auth.");
  }
  return key;
}

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    client = createClient(readSupabaseUrl(), readSupabasePublishableKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Réservé aux tests — force la recréation du client au prochain appel. */
export function resetSupabaseClientForTests(): void {
  client = null;
}
