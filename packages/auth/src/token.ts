/**
 * Nom du cookie de session web. Détail d'implémentation non fixé par
 * CONTRAT-V1 (qui ne grave que la forme d'AuthUser et les 3 fonctions) —
 * stocke directement le JWT Supabase (access token). Rotation/refresh token :
 * explicitement hors contrat, à traiter en implémentation (CONTRAT-V1, "Ce
 * que ce contrat NE couvre PAS").
 */
export const SESSION_COOKIE_NAME = "fid_session";

function parseCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * Authorization: Bearer d'abord (mobile), cookie de session en repli (web) —
 * CONTRAT-V1 §5. Un client mobile n'envoie jamais de cookie de session ; un
 * client web peut migrer vers Bearer sans ambiguïté sur la priorité.
 */
export function extractSessionToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match?.[1]) return match[1];
  }

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    return parseCookie(cookieHeader, SESSION_COOKIE_NAME);
  }

  return null;
}
