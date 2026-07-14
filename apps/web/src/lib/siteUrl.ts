/**
 * Domaine canonique (CONTRAT-V1 §6). Surchageable via NEXT_PUBLIC_SITE_URL
 * pour le dev/preview (ex. http://localhost:3000) — sert de base aux URLs
 * absolues requises par Open Graph, le sitemap et le callback /auth/confirm.
 *
 * Piège connu : le fallback "https://fidwastafid.com" n'est correct qu'APRÈS
 * la bascule Phase 6 (domaine branché sur Vercel). Avant, NEXT_PUBLIC_SITE_URL
 * est OBLIGATOIRE en Production — sans elle, les liens absolus générés
 * (dont l'email de confirmation Supabase) pointent vers un domaine mort.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fidwastafid.com";
