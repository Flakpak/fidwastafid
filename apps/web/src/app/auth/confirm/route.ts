import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getAuthClient } from "../../../lib/supabaseAuthClient.js";
import { setSessionCookie } from "../../../lib/sessionCookie.js";
import { SITE_URL } from "../../../lib/siteUrl.js";

/**
 * Cible du lien de confirmation email Supabase. CONTRAT-V1 §2 : route web
 * hors /api/v1, comparable à /connexion — pas un endpoint JSON.
 *
 * `token_hash` + `verifyOtp()`, pas `code` + `exchangeCodeForSession()` :
 * notre client (supabaseAuthClient.ts) n'a jamais fixé `flowType`, qui vaut
 * `'implicit'` par défaut dans @supabase/auth-js — `signUp()` ne génère
 * donc pas de `code_challenge`, et le flow PKCE ne peut de toute façon pas
 * fonctionner de façon fiable pour un lien d'email (le `code_verifier` vit
 * côté client au moment du signUp, jamais accessible quand le lien est
 * ouvert depuis un autre onglet/appareil). `verifyOtp` avec `token_hash`
 * est sans état, il n'a pas ce problème.
 *
 * Redirections construites depuis SITE_URL, pas depuis l'origine de la
 * requête entrante (`request.url`) — constaté en Docker : l'origine reflète
 * l'hôte de bind interne du serveur (`0.0.0.0`), pas l'hôte réel vu par le
 * client. Même risque derrière un proxy/edge en prod.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const { data, error } = await getAuthClient().auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error && data.session) {
      await setSessionCookie(data.session.access_token, data.session.expires_in);
      return NextResponse.redirect(new URL("/", SITE_URL));
    }
  }

  return NextResponse.redirect(new URL("/connexion?erreur=confirmation", SITE_URL));
}
