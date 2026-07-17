/**
 * Domaine canonique (CONTRAT-V1 §6). Surchageable via NEXT_PUBLIC_SITE_URL
 * pour le dev/preview (ex. http://localhost:3000) — sert de base aux URLs
 * absolues requises par Open Graph, le sitemap et le callback /auth/confirm.
 *
 * Bascule DNS effectuée le 16/07/2026 : fidwastafid.com sert la v2, le
 * fallback ci-dessous est donc correct par défaut désormais.
 *
 * `||` et non `??` : une chaîne vide (ex. build Docker sans le build arg
 * renseigné — docker-compose interpole "" plutôt que d'omettre la variable)
 * doit retomber sur le fallback au même titre qu'une valeur absente,
 * sinon `new URL(path, "")` casse silencieusement.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://fidwastafid.com";
