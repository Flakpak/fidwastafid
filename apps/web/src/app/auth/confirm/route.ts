import { NextResponse } from "next/server";
import { getAuthClient } from "../../../lib/supabaseAuthClient.js";
import { setSessionCookie } from "../../../lib/sessionCookie.js";
import { SITE_URL } from "../../../lib/siteUrl.js";

/**
 * Cible du lien de confirmation email Supabase (flow PKCE : `?code=...`,
 * échangé côté serveur — cohérent avec le reste de l'app, aucun état de
 * session ne vit côté client). CONTRAT-V1 §2 : route web hors /api/v1,
 * comparable à /connexion — pas un endpoint JSON.
 *
 * Redirections construites depuis SITE_URL, pas depuis l'origine de la
 * requête entrante (`request.url`) — constaté en Docker : l'origine reflète
 * l'hôte de bind interne du serveur (`0.0.0.0`), pas l'hôte réel vu par le
 * client. Même risque derrière un proxy/edge en prod.
 *
 * Si le projet Supabase utilise le flow implicite (jeton dans le fragment
 * d'URL, jamais envoyé au serveur) plutôt que PKCE, cette route ne verrait
 * aucun `code` et retomberait sur l'échec — à vérifier avec un vrai email
 * de confirmation une fois "Confirm email" activé, je ne peux pas le
 * simuler sans accès SMTP.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const { data, error } = await getAuthClient().auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      await setSessionCookie(data.session.access_token, data.session.expires_in);
      return NextResponse.redirect(new URL("/", SITE_URL));
    }
  }

  return NextResponse.redirect(new URL("/connexion?erreur=confirmation", SITE_URL));
}
