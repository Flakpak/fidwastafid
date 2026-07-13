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
 * dynamiquement au runtime, ainsi que pour le script Turnstile
 * (challenges.cloudflare.com, page /soumettre) tant que le <script> qui le
 * charge porte lui-même le nonce (voir soumettre/page.tsx). frame-src et
 * connect-src listent explicitement challenges.cloudflare.com : strict-
 * dynamic ne couvre que script-src, pas les iframes ni les appels réseau du
 * widget.
 *
 * CSP désactivé en `next dev` UNIQUEMENT — constat empirique (diagnostic
 * fait avec accord explicite, local uniquement) : le nonce CSP change à
 * chaque requête et casse l'hydratation React sous le HMR/Fast Refresh de
 * `next dev` (SSR correct, mais React ne s'attache jamais côté client).
 * Confirmé SANS lien avec la sécurité elle-même : un build de production
 * réel (`next start`, testé via `docker compose up --build`) hydrate
 * correctement avec le CSP strict complet, inchangé. Donc : la prod garde
 * exactement la même protection (nonce + 'strict-dynamic', jamais
 * 'unsafe-inline') ; seul le confort de dev change.
 *
 * ATTENTION — conséquence directe : `next dev` ne peut plus détecter une
 * violation CSP (ex. script/ressource externe bloqué). Tout morceau qui
 * ajoute du JS client ou une ressource externe doit être revérifié contre
 * un build Docker (`docker compose up --build`, CSP complet) avant d'être
 * considéré terminé — pas seulement testé en `next dev`.
 */
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' data: blob:;
    font-src 'self';
    connect-src 'self' https://challenges.cloudflare.com;
    frame-src 'self' https://challenges.cloudflare.com;
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
