const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Vérification Cloudflare Turnstile (plan v2, Phase 3).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Ce module suit la MÊME structure que le wrapper admin Supabase
 * (`_lib/supabaseAdmin.ts`), et pour la même raison : un `if (!response.ok)
 * return false` écrasait ici quatre situations sans rapport dans une seule
 * valeur. Une panne Cloudflare devenait indistinguable d'un « utilisateur =
 * robot » — toutes les soumissions rejetées, sans trace. Troisième occurrence
 * du motif (voir docs/INCIDENTS.md : 19/07 clé révoquée, 24/07 API admin).
 *
 * > Un fallback silencieux n'est pas un filet de sécurité, juste un échec
 * > retardé et moins lisible.
 *
 * QUATRE classes, jamais confondues :
 *
 *   1. 200 + success:true   -> `"valide"`.
 *   2. 200 + success:false  -> `"refuse"` : vrai échec de vérification.
 *                              L'appelant rejette et invite à recommencer.
 *   3. 429 / 5xx / réseau   -> `TurnstileIndisponibleError` après retries
 *                              bornés. Panne d'INFRASTRUCTURE, pas une faute
 *                              de l'utilisateur : l'appelant décide (la
 *                              soumission passe, marquée non vérifiée).
 *   4. autres 4xx (401/403) -> `TurnstileConfigError`, AUCUN retry. Clé
 *                              invalide ou révoquée : c'est NOTRE bug, pas
 *                              celui de Cloudflare. Fail-closed et bruyant —
 *                              c'est exactement la classe de l'incident du
 *                              19/07/2026, et réessayer une clé morte ne fait
 *                              que retarder le diagnostic.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** 1 tentative initiale + 2 retries maximum. */
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 150;
/** Plafond total d'attente entre tentatives (~1,5 s) — une soumission ne doit
 *  jamais rester bloquée plus longtemps sur un amont HS. */
const MAX_TOTAL_DELAY_MS = 1500;
const BODY_EXCERPT_MAX = 200;

/**
 * Panne d'infrastructure Turnstile. L'appelant PEUT dégrader gracieusement —
 * c'est le cas de `POST /api/v1/deals`, qui accepte la soumission en la
 * marquant non vérifiée plutôt que de la perdre.
 */
export class TurnstileIndisponibleError extends Error {
  /** `null` quand l'échec est réseau (aucune réponse HTTP reçue). */
  readonly status: number | null;
  readonly attempts: number;

  constructor(status: number | null, attempts: number, detail: string) {
    super(
      `Turnstile indisponible — statut ${status ?? "réseau"}, ${attempts} tentative(s). ` +
        `Détail : ${detail || "(aucun)"}`
    );
    this.name = "TurnstileIndisponibleError";
    this.status = status;
    this.attempts = attempts;
  }
}

/**
 * Clé absente, invalide ou révoquée (401/403, autres 4xx). Ne se dégrade
 * JAMAIS et ne se retente jamais : c'est une misconfiguration de notre côté.
 */
export class TurnstileConfigError extends Error {
  readonly status: number | null;

  constructor(status: number | null, detail: string) {
    super(
      `Turnstile : erreur de configuration ou de droits — statut ${status ?? "clé absente"}. ` +
        `Vérifier TURNSTILE_SECRET_KEY. Détail : ${detail || "(aucun)"}`
    );
    this.name = "TurnstileConfigError";
    this.status = status;
  }
}

export type TurnstileVerdict =
  | { verdict: "valide" }
  /** `codes` = `error-codes` renvoyés par Cloudflare, utiles au diagnostic. */
  | { verdict: "refuse"; codes: string[] };

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
}

function readSecretKey(): string {
  const key = process.env.TURNSTILE_SECRET_KEY;
  // Clé absente = misconfiguration, même classe qu'un 401 : bruyante, jamais
  // retentée, jamais confondue avec une panne Cloudflare.
  if (!key) throw new TurnstileConfigError(null, "TURNSTILE_SECRET_KEY manquant.");
  return key;
}

function estTransitoire(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Backoff exponentiel + jitter — évite que plusieurs soumissions concurrentes
 *  retentent en rafale synchrone au même instant. */
function backoffDelay(attempt: number): number {
  return BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * BASE_DELAY_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bodyExcerpt(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, BODY_EXCERPT_MAX);
  } catch {
    return "(corps illisible)";
  }
}

function logEchec(params: { attempt: number; status: number | null; detail: string; retryDans?: number }): void {
  const { attempt, status, detail, retryDans } = params;
  const suite = retryDans === undefined ? "abandon" : `retry dans ${Math.round(retryDans)} ms`;
  console.error(
    `[turnstile] siteverify -> statut=${status ?? "réseau"} tentative=${attempt}/${MAX_ATTEMPTS} ` +
      `${suite} détail=${JSON.stringify(detail)}`
  );
}

/**
 * Vérifie un token Turnstile. `remoteIp` est optionnel côté Cloudflare mais
 * recommandé quand disponible.
 *
 * Un token absent est un `refuse` — pas une panne : le widget n'a rien produit,
 * c'est bien la vérification qui n'a pas eu lieu côté client.
 */
export async function verifierTurnstile(token: string | null, remoteIp?: string): Promise<TurnstileVerdict> {
  if (!token) return { verdict: "refuse", codes: ["missing-input-response"] };

  const secret = readSecretKey();
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let attempt = 0;
  let attenduMs = 0;
  let dernierStatut: number | null = null;
  let dernierDetail = "";

  while (attempt < MAX_ATTEMPTS) {
    attempt++;

    let response: Response;
    try {
      // Le corps est re-sérialisé à chaque tentative : un URLSearchParams est
      // consommable plusieurs fois, mais on reste explicite.
      response = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: new URLSearchParams(body) });
    } catch (err) {
      dernierStatut = null;
      dernierDetail = (err instanceof Error ? err.message : String(err)).slice(0, BODY_EXCERPT_MAX);
      const delai = backoffDelay(attempt);
      const peutRetenter = attempt < MAX_ATTEMPTS && attenduMs + delai <= MAX_TOTAL_DELAY_MS;
      logEchec({ attempt, status: null, detail: dernierDetail, retryDans: peutRetenter ? delai : undefined });
      if (!peutRetenter) break;
      attenduMs += delai;
      await sleep(delai);
      continue;
    }

    if (response.ok) {
      const data = (await response.json()) as TurnstileResponse;
      if (data.success === true) return { verdict: "valide" };
      // Classe 2 : Cloudflare a répondu, et il dit non. Verdict légitime, ce
      // n'est pas une panne — on le distingue explicitement.
      return { verdict: "refuse", codes: data["error-codes"] ?? [] };
    }

    const detail = await bodyExcerpt(response);

    if (estTransitoire(response.status)) {
      dernierStatut = response.status;
      dernierDetail = detail;
      const delai = backoffDelay(attempt);
      const peutRetenter = attempt < MAX_ATTEMPTS && attenduMs + delai <= MAX_TOTAL_DELAY_MS;
      logEchec({ attempt, status: response.status, detail, retryDans: peutRetenter ? delai : undefined });
      if (!peutRetenter) break;
      attenduMs += delai;
      await sleep(delai);
      continue;
    }

    // Classe 4 : 401/403 et autres 4xx — configuration. Aucun retry.
    logEchec({ attempt, status: response.status, detail });
    throw new TurnstileConfigError(response.status, detail);
  }

  throw new TurnstileIndisponibleError(dernierStatut, attempt, dernierDetail);
}
