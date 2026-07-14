const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function readSecretKey(): string {
  const key = process.env.TURNSTILE_SECRET_KEY;
  if (!key) {
    throw new Error("TURNSTILE_SECRET_KEY manquant.");
  }
  return key;
}

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
}

/**
 * Vérifie un token Turnstile auprès de Cloudflare (plan v2, Phase 3 :
 * "Cloudflare Turnstile sur la soumission publique"). `remoteIp` est
 * optionnel côté Cloudflare mais recommandé quand disponible.
 */
export async function verifyTurnstile(token: string | null, remoteIp?: string): Promise<boolean> {
  if (!token) return false;

  const body = new URLSearchParams({ secret: readSecretKey(), response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  const response = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body });
  if (!response.ok) return false;

  const data = (await response.json()) as TurnstileResponse;
  // TEMPORAIRE — diagnostic échec soumission préversion, à retirer après lecture des logs Vercel.
  if (!data.success) {
    console.error("[turnstile-diag] rejet siteverify", { errorCodes: data["error-codes"], hostname: data.hostname });
  }
  return data.success === true;
}
