import { query } from "@fidwastafid/db";

/**
 * Limites par action — CONTRAT-V1 §4 ne fixe pas de chiffres, seulement le
 * principe ("ciblé sur POST votes/commentaires/deals"). Valeurs de départ
 * raisonnables pour une petite communauté, ajustables sans casser l'API.
 */
export const RATE_LIMITS = {
  soumission: { limit: 5, windowSeconds: 3600 },
  vote: { limit: 30, windowSeconds: 60 },
  commentaire: { limit: 10, windowSeconds: 60 },
  profil: { limit: 10, windowSeconds: 3600 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

/** Proxy/CDN (Cloudflare en cible) pose x-forwarded-for — CONTRAT-V1/échange explicite. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Fenêtre glissante minimale : incrémente si la fenêtre courante n'est pas
 * expirée, la réinitialise sinon. Une seule requête SQL (upsert atomique) —
 * pas de lecture-puis-écriture qui pourrait se chevaucher entre requêtes
 * concurrentes.
 */
async function countInWindow(cle: string, windowSeconds: number): Promise<number> {
  const rows = await query<{ compte: number }>(
    `insert into rate_limits (cle, compte, fenetre_debut)
     values ($1, 1, now())
     on conflict (cle) do update set
       compte = case
         when rate_limits.fenetre_debut < now() - make_interval(secs => $2) then 1
         else rate_limits.compte + 1
       end,
       fenetre_debut = case
         when rate_limits.fenetre_debut < now() - make_interval(secs => $2) then now()
         else rate_limits.fenetre_debut
       end
     returning compte`,
    [cle, windowSeconds]
  );
  return rows[0]?.compte ?? 0;
}

/**
 * Vérifie IP et utilisateur (CONTRAT-V1 §4 : "par IP et par utilisateur").
 * Chaque tentative compte dans les deux compteurs, qu'elle soit finalement
 * bloquée ou non — comportement standard d'un rate limiter.
 */
export async function isRateLimited(action: RateLimitAction, request: Request, userId: string): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[action];
  const ip = getClientIp(request);

  const [countIp, countUser] = await Promise.all([
    countInWindow(`${action}:ip:${ip}`, windowSeconds),
    countInWindow(`${action}:user:${userId}`, windowSeconds),
  ]);

  return countIp > limit || countUser > limit;
}
