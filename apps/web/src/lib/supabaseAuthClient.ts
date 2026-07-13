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

export function getAuthClient() {
  return createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
