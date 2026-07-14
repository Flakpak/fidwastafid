import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@fidwastafid/auth";

/**
 * Partagé entre authActions.ts (Server Actions connexion/inscription) et
 * la route de callback de confirmation email (auth/confirm/route.ts) —
 * un seul endroit qui décide des attributs du cookie de session.
 */
export async function setSessionCookie(accessToken: string, expiresIn: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: expiresIn,
  });
}
