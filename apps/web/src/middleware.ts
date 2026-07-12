import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * CSP par nonce, pas de 'unsafe-inline' — CONTRAT-V1/plan v2 §"sécurité by
 * design", décision explicite : sur une plateforme à contenu généré par les
 * utilisateurs (soumissions, commentaires), affaiblir script-src avec
 * 'unsafe-inline' annulerait la protection XSS du CSP.
 *
 * Next.js App Router injecte lui-même des <script> inline pour l'hydratation
 * RSC (self.__next_f.push(...)) : ils ont besoin d'un nonce valide, d'où ce
 * middleware plutôt qu'un header statique dans next.config. Next.js détecte
 * automatiquement le nonce posé dans le header Content-Security-Policy et
 * l'applique à ses propres scripts injectés (pattern documenté officiel).
 * 'strict-dynamic' fait confiance à tout script chargé par un script déjà
 * autorisé par nonce — nécessaire pour les chunks JS que Next charge
 * dynamiquement au runtime.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' data: blob:;
    font-src 'self';
    connect-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    // Exclut les assets statiques (pas des documents, pas besoin de nonce).
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
