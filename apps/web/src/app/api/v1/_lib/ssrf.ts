import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

/**
 * Garde SSRF — POST /api/v1/admin/deals/:publicId/image-depuis-lien
 * (CONTRAT-V1 §4, troisième amendement conscient du 19/07/2026) : ce endpoint
 * fait fetcher au SERVEUR une URL fournie indirectement par un tiers (le
 * `lien` du deal, potentiellement soumis par un utilisateur non admin lors
 * de la soumission d'origine) — sans garde, un lien malveillant pourrait
 * faire interroger le serveur lui-même un service interne (localhost,
 * réseau privé, endpoint de métadonnées cloud type 169.254.169.254).
 *
 * Une seule erreur, volontairement peu bavarde (jamais le détail de l'IP
 * résolue ni de la règle précise qui a bloqué) : pas d'oracle réseau exposé
 * à un attaquant qui sonderait ce endpoint.
 */
export class SsrfGuardError extends Error {
  constructor(message = "Lien non autorisé.") {
    super(message);
    this.name = "SsrfGuardError";
  }
}

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Classification IP privée/réservée — fonction PURE (aucun accès réseau),
 * testée unitairement avec des cas hostiles (packages/tests unitaires,
 * apps/web/tests/unit.ts). Plages couvertes (CONTRAT-V1, amendement
 * ci-dessus) : loopback (127.0.0.0/8, ::1), privées RFC1918
 * (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), link-local (169.254.0.0/16,
 * fe80::/10), unique-local IPv6 (fc00::/7), "this network" (0.0.0.0/8) —
 * cette dernière plage n'est pas listée nommément dans l'amendement mais
 * couvre le même risque (0.0.0.0 résout localement sur la plupart des piles
 * réseau, contournement classique de liste blanche).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const octets = ip.split(".").map(Number);
    const [a, b] = octets;
    if (a === undefined || b === undefined) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }

  if (isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true;
    // fc00::/7 : premier hextet dans [fc00, fdff] — préfixe "fc" ou "fd".
    const firstHextet = normalized.split(":")[0] ?? "";
    if (/^f[cd]/.test(firstHextet)) return true;
    // fe80::/10 (link-local) : premier hextet dans [fe80, febf].
    if (/^fe[89ab]/.test(firstHextet)) return true;
    // IPv4 mappée (::ffff:a.b.c.d) — reclasse selon les règles IPv4 ci-dessus.
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateOrReservedIp(mapped[1]);
    return false;
  }

  // Ni IPv4 ni IPv6 reconnue par Node — refus prudent plutôt qu'un passage.
  return true;
}

/**
 * Valide protocole + résolution DNS d'une URL avant de la fetcher — appelée
 * avant la requête initiale ET avant chaque hop de redirection (cf.
 * safeFetch). `dns.lookup` sur un littéral IP (ex. un hostname déjà
 * "127.0.0.1") court-circuite en local sans requête réseau — la garde reste
 * déterministe et testable hors ligne pour ce cas.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfGuardError("URL invalide.");
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfGuardError("Protocole non autorisé.");
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new SsrfGuardError("Hôte introuvable.");
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new SsrfGuardError("Hôte non autorisé.");
  }
  return url;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

/**
 * fetch() protégé SSRF — `redirect: "manual"` : chaque redirection est
 * interceptée et son URL cible revalidée (protocole + DNS) avant d'être
 * suivie, jamais déléguée au fetch natif qui suivrait aveuglément vers un
 * hôte non revérifié. Plafonné à `maxRedirects` hops (défaut 3).
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; maxRedirects?: number } = {}
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;

  let currentUrl = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { ...init, redirect: "manual", signal: controller.signal });
    } catch {
      throw new SsrfGuardError("Requête réseau impossible ou expirée.");
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new SsrfGuardError("Redirection sans Location.");
      currentUrl = new URL(location, url).toString();
      continue;
    }
    return response;
  }
  throw new SsrfGuardError("Trop de redirections.");
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Lit un Response en respectant un plafond de taille, en streaming — un
 * `Content-Length` mentante ou absent ne protège de rien, seule la lecture
 * chunk par chunk avec abandon dès dépassement est fiable.
 */
export async function readLimited(response: Response, maxBytes: number = DEFAULT_MAX_BYTES): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new SsrfGuardError("Réponse trop volumineuse.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
