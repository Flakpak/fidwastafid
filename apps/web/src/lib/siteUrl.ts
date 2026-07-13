/**
 * Domaine canonique (CONTRAT-V1 §6). Surchageable via NEXT_PUBLIC_SITE_URL
 * pour le dev/preview (ex. http://localhost:3000) — sert de base aux URLs
 * absolues requises par Open Graph et le sitemap.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fidwastafid.com";
