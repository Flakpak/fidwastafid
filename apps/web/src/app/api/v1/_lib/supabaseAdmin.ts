import { createHash } from "node:crypto";

/**
 * Opérations Supabase Auth Admin — fetch nu, service role, même approche
 * sans SDK que la route proxy d'image (apps/web/src/app/img/deals/[publicId]/route.ts,
 * CONTRAT-V1 §6) : LE point à réécrire le jour d'un changement de backend
 * auth. Réservé à /api/v1/me (lecture de l'email, suppression de compte) —
 * jamais appelé depuis packages/auth, qui ne fait que VÉRIFIER un JWT
 * entrant (CONTRAT-V1 §5, interface figée, aucune opération d'écriture).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TOUT appel à l'API admin passe par `supabaseAdminFetch()` ci-dessous.
 *
 * Leçon déjà gravée dans .github/workflows/ci.yml (lignes 92-100, incident du
 * 19/07/2026 — clé révoquée côté Supabase sans que rien ne le signale, 18 runs
 * rouges avant diagnostic) : **un fallback silencieux n'est pas un filet de
 * sécurité, juste un échec retardé et moins lisible.**
 *
 * Le même motif s'est répété le 24/07/2026 (voir docs/INCIDENTS.md), un cran
 * plus bas : `if (!response.ok) return null` écrasait un 429 ou un 502 dans le
 * même `null` qu'un 404 légitime. Impossible de distinguer « cet utilisateur
 * n'existe pas » d'« Supabase a hoqueté », et `buildMe()` transformait les deux
 * en 500 pour un utilisateur parfaitement valide.
 *
 * D'où la séparation STRICTE de trois classes de résultat, qui ne doivent
 * jamais se confondre :
 *   - 2xx                      -> succès, `Response` rendue telle quelle ;
 *   - 404                      -> la ressource n'existe réellement pas.
 *                                 `null` légitime, ce n'est PAS une panne ;
 *   - 429 / 5xx / réseau       -> transitoire. `SupabaseAdminUnavailableError`
 *                                 après retries bornés. Jamais `null` ;
 *   - autres 4xx (401/403…)    -> configuration ou droits (la classe exacte de
 *                                 l'incident du 19/07). `SupabaseAdminConfigError`,
 *                                 JAMAIS de retry : réessayer une clé révoquée
 *                                 ne fait que retarder le diagnostic.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** 1 tentative initiale + 2 retries maximum. */
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 150;
/** Plafond total du temps passé à attendre entre les tentatives (~1,5 s) —
 *  une route web ne doit jamais rester bloquée plus longtemps sur un amont HS. */
const MAX_TOTAL_DELAY_MS = 1500;
/** Extrait de corps journalisé sur échec — borné : un corps d'erreur Supabase
 *  peut être volumineux, et les logs ne sont pas un dépotoir. */
const BODY_EXCERPT_MAX = 200;

/**
 * Erreur transitoire : l'amont est momentanément indisponible (429, 5xx,
 * coupure réseau). L'appelant PEUT dégrader gracieusement — c'est le cas de
 * `buildMe()`, qui rend le profil sans l'e-mail plutôt qu'un 500.
 */
export class SupabaseAdminUnavailableError extends Error {
  /** `null` quand l'échec est réseau (aucune réponse HTTP reçue). */
  readonly status: number | null;
  readonly attempts: number;

  constructor(operation: string, status: number | null, attempts: number, detail: string) {
    super(
      `API admin Supabase indisponible (${operation}) — statut ${status ?? "réseau"}, ` +
        `${attempts} tentative(s). Détail : ${detail || "(aucun)"}`
    );
    this.name = "SupabaseAdminUnavailableError";
    this.status = status;
    this.attempts = attempts;
  }
}

/**
 * Erreur de configuration ou de droits (401, 403, autres 4xx hors 404). Ne se
 * dégrade JAMAIS en silence et ne se retente jamais : c'est la signature d'une
 * clé révoquée/erronée, exactement l'incident du 19/07/2026.
 */
export class SupabaseAdminConfigError extends Error {
  readonly status: number;

  constructor(operation: string, status: number, detail: string) {
    super(
      `API admin Supabase : erreur de configuration ou de droits (${operation}) — ` +
        `statut ${status}. Vérifier SUPABASE_SECRET_KEY. Détail : ${detail || "(aucun)"}`
    );
    this.name = "SupabaseAdminConfigError";
    this.status = status;
  }
}

/**
 * Nouvelles clés Supabase (sb_secret_...) : header `apikey` uniquement,
 * jamais `Authorization: Bearer` — ce ne sont pas des JWT, un envoi en
 * Bearer est rejeté (doc Supabase, migration des clés API, 18/07/2026).
 * Migration terminée (19/07/2026, voir docs/MIGRATION-CLES-SUPABASE.md) :
 * plus de fallback vers l'ancienne `service_role`, désactivée côté
 * Dashboard Supabase.
 *
 * Résolu UNE fois avant la boucle de retry : une clé absente est une
 * misconfiguration de démarrage, pas une panne passagère — la retenter 3 fois
 * n'aurait aucun sens.
 */
function adminHeaders(): HeadersInit {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY manquant.");
  return { apikey: secretKey };
}

/**
 * Empreinte courte et non réversible d'un identifiant utilisateur — l'UUID
 * auth est une donnée personnelle, il ne part jamais en clair dans les logs
 * (il ne sort déjà jamais d'une réponse API, CONTRAT-V1 §5). 8 caractères
 * suffisent à corréler deux lignes de log entre elles.
 */
function pseudonymise(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 8);
}

function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Backoff exponentiel + jitter : 150→300 ms de base, plus 0-150 ms d'aléa
 *  (évite que plusieurs requêtes concurrentes retentent en rafale synchrone). */
function backoffDelay(attempt: number): number {
  return BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * BASE_DELAY_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lecture best-effort du corps d'erreur — ne doit jamais masquer l'échec réel. */
async function bodyExcerpt(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, BODY_EXCERPT_MAX);
  } catch {
    return "(corps illisible)";
  }
}

function logEchec(params: {
  operation: string;
  method: string;
  logPath: string;
  attempt: number;
  status: number | null;
  detail: string;
  retryDans?: number;
}): void {
  const { operation, method, logPath, attempt, status, detail, retryDans } = params;
  const suite = retryDans === undefined ? "abandon" : `retry dans ${Math.round(retryDans)} ms`;
  console.warn(
    `[supabase-admin] ${operation} ${method} ${logPath} -> statut=${status ?? "réseau"} ` +
      `tentative=${attempt}/${MAX_ATTEMPTS} ${suite} détail=${JSON.stringify(detail)}`
  );
}

/**
 * Point de passage unique vers l'API admin Supabase. Renvoie la `Response`
 * (2xx), ou `null` sur 404 (absence légitime). Jette une erreur TYPÉE dans
 * tous les autres cas — jamais de `null` fourre-tout.
 */
async function supabaseAdminFetch(params: {
  /** Chemin réel, avec l'UUID. */
  path: string;
  /** Même chemin, UUID pseudonymisé — c'est CE chemin qui part dans les logs. */
  logPath: string;
  method: string;
  /** Nom de l'opération appelante, pour rendre les logs lisibles. */
  operation: string;
}): Promise<Response | null> {
  const { path, logPath, method, operation } = params;
  const url = `${process.env.SUPABASE_URL}${path}`;
  const headers = adminHeaders();

  let attempt = 0;
  let attenduMs = 0;
  let dernierStatut: number | null = null;
  let dernierDetail = "";

  while (attempt < MAX_ATTEMPTS) {
    attempt++;

    let response: Response;
    try {
      response = await fetch(url, { method, headers });
    } catch (err) {
      // Coupure réseau / DNS / TLS : transitoire par nature.
      dernierStatut = null;
      dernierDetail = (err instanceof Error ? err.message : String(err)).slice(0, BODY_EXCERPT_MAX);
      const delai = backoffDelay(attempt);
      const peutRetenter = attempt < MAX_ATTEMPTS && attenduMs + delai <= MAX_TOTAL_DELAY_MS;
      logEchec({ operation, method, logPath, attempt, status: null, detail: dernierDetail, retryDans: peutRetenter ? delai : undefined });
      if (!peutRetenter) break;
      attenduMs += delai;
      await sleep(delai);
      continue;
    }

    if (response.ok) return response;

    // 404 : la ressource n'existe pas. Résultat métier légitime, pas une panne
    // — surtout pas de retry, et surtout pas confondu avec un 5xx.
    if (response.status === 404) return null;

    const detail = await bodyExcerpt(response);

    if (isTransientStatus(response.status)) {
      dernierStatut = response.status;
      dernierDetail = detail;
      const delai = backoffDelay(attempt);
      const peutRetenter = attempt < MAX_ATTEMPTS && attenduMs + delai <= MAX_TOTAL_DELAY_MS;
      logEchec({ operation, method, logPath, attempt, status: response.status, detail, retryDans: peutRetenter ? delai : undefined });
      if (!peutRetenter) break;
      attenduMs += delai;
      await sleep(delai);
      continue;
    }

    // 401/403 et autres 4xx : configuration ou droits. Aucun retry (cf. en-tête).
    logEchec({ operation, method, logPath, attempt, status: response.status, detail });
    throw new SupabaseAdminConfigError(operation, response.status, detail);
  }

  throw new SupabaseAdminUnavailableError(operation, dernierStatut, attempt, dernierDetail);
}

/**
 * GET /api/v1/me — l'email ne vit que dans Supabase Auth, jamais dupliqué dans
 * public.users.
 *
 * `null` signifie EXACTEMENT une chose : le compte auth n'existe pas (404).
 * Une indisponibilité amont lève `SupabaseAdminUnavailableError` — l'appelant
 * décide de dégrader ou non (cf. `buildMe`), il n'a plus à deviner.
 */
export async function fetchAuthUserEmail(userId: string): Promise<string | null> {
  const response = await supabaseAdminFetch({
    path: `/auth/v1/admin/users/${userId}`,
    logPath: `/auth/v1/admin/users/{uid:${pseudonymise(userId)}}`,
    method: "GET",
    operation: "fetchAuthUserEmail",
  });
  if (response === null) return null;
  const body = (await response.json()) as { email?: string };
  return body.email ?? null;
}

/**
 * DELETE /api/v1/me — dernière étape de la suppression de compte.
 *
 * `false` = compte auth introuvable (404). Une panne amont lève désormais une
 * erreur typée au lieu de rendre `false` : dans les deux cas la transaction
 * appelante est annulée (route DELETE /api/v1/me), mais le message dit
 * maintenant lequel des deux cas s'est produit.
 */
export async function deleteAuthUser(userId: string): Promise<boolean> {
  const response = await supabaseAdminFetch({
    path: `/auth/v1/admin/users/${userId}`,
    logPath: `/auth/v1/admin/users/{uid:${pseudonymise(userId)}}`,
    method: "DELETE",
    operation: "deleteAuthUser",
  });
  return response !== null;
}

/** Exporté pour les tests unitaires uniquement — ne pas appeler ailleurs :
 *  tout nouvel appel admin doit passer par une fonction nommée ci-dessus. */
export const __testing = { supabaseAdminFetch, MAX_ATTEMPTS };
