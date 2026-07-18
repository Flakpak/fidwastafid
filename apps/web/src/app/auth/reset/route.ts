import { NextResponse } from "next/server";
import { getAuthClient } from "../../../lib/supabaseAuthClient.js";
import { setSessionCookie } from "../../../lib/sessionCookie.js";
import { SITE_URL } from "../../../lib/siteUrl.js";

/**
 * Cible du lien de réinitialisation de mot de passe Supabase — même montage
 * que /auth/confirm/route.ts, et pour la même raison : `verifyOtp` pose un
 * cookie de session (`setSessionCookie`), or Next.js 15 interdit toute
 * mutation de cookies en dehors d'une Server Action ou d'un Route Handler.
 * Cette vérification vivait auparavant dans /reinitialiser-mot-de-passe/page.tsx
 * (un Server Component, donc en rendu de page) — ce qui plantait en
 * production dès qu'un vrai token passait la vérification (incident du
 * 18/07/2026, digest 773635100). Toute la logique verifyOtp+cookie est
 * désormais ici ; la page ne fait plus que lire l'état déjà posé.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (tokenHash && type === "recovery") {
    const { data, error } = await getAuthClient().auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (!error && data.session) {
      await setSessionCookie(data.session.access_token, data.session.expires_in);
      return NextResponse.redirect(new URL("/reinitialiser-mot-de-passe", SITE_URL));
    }
  }

  return NextResponse.redirect(new URL("/reinitialiser-mot-de-passe?erreur=invalide", SITE_URL));
}
