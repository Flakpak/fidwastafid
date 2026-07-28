import { isPrivateOrReservedIp, assertPublicUrl, SsrfGuardError } from "../src/app/api/v1/_lib/ssrf.js";
import { extractImageUrl } from "../src/app/api/v1/_lib/ogImage.js";
import { sniffImageMime } from "../src/app/api/v1/_lib/dealImage.js";
import { POST as postRevalidate } from "../src/app/api/revalidate/route.js";
import { dealOgDescription, truncateOgTitle, dealJsonLd } from "../src/app/deal/[slugAndId]/seo.js";
import { buildShareText } from "../src/components/shareText.js";
import {
  fetchAuthUserEmail,
  SupabaseAdminUnavailableError,
  SupabaseAdminConfigError,
} from "../src/app/api/v1/_lib/supabaseAdmin.js";
import { resolveMeEmail } from "../src/app/api/v1/_lib/me.js";
import {
  verifierTurnstile,
  TurnstileIndisponibleError,
  TurnstileConfigError,
} from "../src/app/api/v1/_lib/turnstile.js";
import { lireCommentaires } from "../src/app/deal/[slugAndId]/commentaires.js";
import {
  TAILLE_PAGE,
  construireParamsFacettes,
  construireParamsFeed,
  fusionnerSansDoublon,
  messageErreurFeed,
} from "../src/lib/feedPagination.js";
import {
  FILTRES_PAR_DEFAUT,
  ecrireFiltresUrl,
  lireFiltresUrl,
  nbFiltresActifs,
  normaliserFiltres,
  optionDesactivee,
  resumeFiltres,
  type EtatFiltres,
} from "../src/lib/filtresFeed.js";
import {
  conditionCategorie,
  conditionType,
  conditionVille,
  conditionsBase,
  lireFiltres,
  signatureFiltres,
  type Lieur,
} from "../src/app/api/v1/_lib/dealsFilters.js";
import { assemblerFacettes, requeteFacettes } from "../src/app/api/v1/_lib/dealsFacettes.js";
import { encodeCursor } from "../src/app/api/v1/_lib/pagination.js";
import { GET as getDeals } from "../src/app/api/v1/deals/route.js";
import { champsModifies, normaliserValeurAudit } from "../src/app/api/v1/_lib/auditDiff.js";
import { motifRejetManquant, publicIdSchema, PUBLIC_ID_ALPHABET, type Deal } from "@fidwastafid/schemas";
import { PUBLIC_IDS_FIXTURES, PUBLIC_ID_INEXISTANT, TOUS_LES_PUBLIC_IDS } from "./fixtures.js";

// Jeton de test purement local (Phase 7B) — jamais le vrai REVALIDATE_TOKEN,
// qui n'existe que côté Vercel/secrets GitHub. Comparable au
// TURNSTILE_SECRET_KEY "always passes" déjà en clair dans .github/workflows/
// ci.yml : une valeur fixture, pas un secret.
process.env.REVALIDATE_TOKEN = "jeton-de-test-local-jamais-reel";

/**
 * Tests unitaires — offline, aucun réseau ni base de données (job CI
 * "quality", `pnpm test` à la racine, jamais bloqué par les secrets Supabase).
 * Complète tests/integration.ts (celui-ci exige un vrai Postgres + JWT).
 *
 * Garde SSRF (CONTRAT-V1 §4, troisième amendement conscient du 19/07/2026) :
 * cas hostiles explicitement listés par l'amendement, plus quelques bornes
 * de plage (172.15/172.32, limites de fc00::/7 et fe80::/10).
 */

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`  ok  - ${label}`);
  } else {
    fail++;
    console.log(`FAIL  - ${label}`);
  }
}

console.log("SSRF — isPrivateOrReservedIp : cas hostiles (doivent être rejetés)");
check("10.0.0.0 (RFC1918)", isPrivateOrReservedIp("10.0.0.0"));
check("10.255.255.255 (RFC1918)", isPrivateOrReservedIp("10.255.255.255"));
check("172.16.0.0 (RFC1918, borne basse)", isPrivateOrReservedIp("172.16.0.0"));
check("172.31.255.255 (RFC1918, borne haute)", isPrivateOrReservedIp("172.31.255.255"));
check("192.168.1.1 (RFC1918)", isPrivateOrReservedIp("192.168.1.1"));
check("127.0.0.1 (loopback)", isPrivateOrReservedIp("127.0.0.1"));
check("127.255.255.255 (loopback, borne haute)", isPrivateOrReservedIp("127.255.255.255"));
check("169.254.169.254 (métadonnées cloud)", isPrivateOrReservedIp("169.254.169.254"));
check("0.0.0.0 (this network)", isPrivateOrReservedIp("0.0.0.0"));
check("::1 (loopback IPv6)", isPrivateOrReservedIp("::1"));
check("fc00::1 (unique-local IPv6, borne basse)", isPrivateOrReservedIp("fc00::1"));
check("fdff:ffff::1 (unique-local IPv6, borne haute)", isPrivateOrReservedIp("fdff:ffff::1"));
check("fe80::1 (link-local IPv6)", isPrivateOrReservedIp("fe80::1"));
check("::ffff:127.0.0.1 (IPv4 loopback mappée en IPv6)", isPrivateOrReservedIp("::ffff:127.0.0.1"));
check("::ffff:10.0.0.5 (IPv4 privée mappée en IPv6)", isPrivateOrReservedIp("::ffff:10.0.0.5"));

console.log("\nSSRF — isPrivateOrReservedIp : bornes limitrophes (doivent être ACCEPTÉES, hors plage)");
check("172.15.255.255 juste sous 172.16/12 -> public", !isPrivateOrReservedIp("172.15.255.255"));
check("172.32.0.0 juste au-dessus de 172.31/12 -> public", !isPrivateOrReservedIp("172.32.0.0"));
check("169.253.255.255 juste sous 169.254/16 -> public", !isPrivateOrReservedIp("169.253.255.255"));
check("fbff:ffff::1 juste sous fc00::/7 -> public", !isPrivateOrReservedIp("fbff:ffff::1"));

console.log("\nSSRF — isPrivateOrReservedIp : IP publiques (doivent être acceptées)");
check("8.8.8.8 (DNS public)", !isPrivateOrReservedIp("8.8.8.8"));
check("93.184.216.34 (IP publique quelconque)", !isPrivateOrReservedIp("93.184.216.34"));
check("2001:4860:4860::8888 (DNS public IPv6)", !isPrivateOrReservedIp("2001:4860:4860::8888"));

console.log("\nSSRF — assertPublicUrl : protocole et résolution");
async function checkAsyncRejects(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false);
  } catch (err) {
    check(label, err instanceof SsrfGuardError);
  }
}
async function checkAsyncResolves(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, true);
  } catch {
    check(label, false);
  }
}

async function runAsyncChecks() {
  await checkAsyncRejects("ftp:// rejeté (protocole non autorisé)", () => assertPublicUrl("ftp://example.com/x"));
  await checkAsyncRejects("file:// rejeté (protocole non autorisé)", () => assertPublicUrl("file:///etc/passwd"));
  await checkAsyncRejects("URL invalide rejetée", () => assertPublicUrl("pas-une-url"));
  await checkAsyncRejects("http://127.0.0.1 rejeté (littéral IP loopback)", () => assertPublicUrl("http://127.0.0.1/x"));
  await checkAsyncRejects("http://169.254.169.254 rejeté (métadonnées cloud)", () =>
    assertPublicUrl("http://169.254.169.254/latest/meta-data")
  );
  await checkAsyncRejects("http://[::1] rejeté (littéral IPv6 loopback)", () => assertPublicUrl("http://[::1]/x"));
  await checkAsyncResolves("https://exemple-litteral-ip-publique accepté (protocole + IP publique)", () =>
    assertPublicUrl("https://8.8.8.8/x")
  );

  console.log("\nPOST /api/revalidate — jeton (cas d'erreur, avant tout accès base)");
  const sansJetonRes = await postRevalidate(new Request("http://localhost/api/revalidate", { method: "POST" }));
  check("sans jeton -> 401", sansJetonRes.status === 401);

  const mauvaisJetonRes = await postRevalidate(
    new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "x-revalidate-token": "mauvais-jeton" },
    })
  );
  check("mauvais jeton -> 401", mauvaisJetonRes.status === 401);

  await checkWrapperAdminSupabase();
  await checkTurnstile();
  await checkCommentaires();
  await checkCurseurFiltres();

  console.log(`\n${pass} passés, ${fail} échoués`);
  if (fail > 0) process.exit(1);
}

/**
 * Wrapper admin Supabase (supabaseAdmin.ts) — cœur du correctif de l'incident
 * du 24/07/2026 (docs/INCIDENTS.md). Ces tests existent pour qu'on ne
 * retombe JAMAIS dans le `return null` fourre-tout : chaque classe d'échec
 * doit rester distinguable des deux autres.
 *
 * `fetch` global est remplacé par un bouchon (aucun réseau — ce harnais est
 * hors ligne, cf. en-tête de ce fichier), puis restauré.
 */
async function checkWrapperAdminSupabase() {
  console.log("\nAPI admin Supabase — wrapper : 404 / transitoire / configuration");

  process.env.SUPABASE_URL = "https://projet-fixture.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_fixture_jamais_reelle";

  const fetchOriginal = globalThis.fetch;
  let appels = 0;

  /** Bouchon : renvoie successivement les réponses fournies (la dernière est
   *  répétée si le wrapper retente au-delà de la liste). */
  function stubFetch(reponses: { status: number; body?: string }[]) {
    appels = 0;
    globalThis.fetch = (async () => {
      const r = reponses[Math.min(appels, reponses.length - 1)]!;
      appels++;
      return new Response(r.body ?? "", { status: r.status });
    }) as typeof globalThis.fetch;
  }

  const UID = "11111111-2222-3333-4444-555555555555";

  try {
    // 1. 404 -> null, aucun retry (absence légitime, pas une panne).
    stubFetch([{ status: 404, body: '{"msg":"User not found"}' }]);
    const email404 = await fetchAuthUserEmail(UID);
    check("404 -> null (utilisateur inexistant, pas une panne)", email404 === null);
    check("404 -> aucun retry (1 seul appel)", appels === 1);

    // 2. 500 puis 200 -> succès après un retry.
    stubFetch([{ status: 500, body: "boom" }, { status: 200, body: '{"email":"membre@exemple.ma"}' }]);
    const emailRetry = await fetchAuthUserEmail(UID);
    check("500 puis 200 -> succès après retry", emailRetry === "membre@exemple.ma");
    check("500 puis 200 -> exactement 2 appels (1 retry)", appels === 2);

    // 3. 500 persistant -> erreur typée transitoire, JAMAIS null.
    stubFetch([{ status: 503, body: "indisponible" }]);
    let transitoire: unknown = null;
    try {
      await fetchAuthUserEmail(UID);
    } catch (err) {
      transitoire = err;
    }
    check(
      "5xx persistant -> SupabaseAdminUnavailableError (jamais null)",
      transitoire instanceof SupabaseAdminUnavailableError
    );
    check(
      "5xx persistant -> statut réel porté par l'erreur",
      transitoire instanceof SupabaseAdminUnavailableError && transitoire.status === 503
    );
    check("5xx persistant -> tentatives bornées (3 appels max)", appels === 3);

    // 4. 401 -> erreur de configuration, aucun retry (clé révoquée : incident
    //    du 19/07/2026 — la retenter ne ferait que retarder le diagnostic).
    stubFetch([{ status: 401, body: '{"msg":"Invalid API key"}' }]);
    let config: unknown = null;
    try {
      await fetchAuthUserEmail(UID);
    } catch (err) {
      config = err;
    }
    check("401 -> SupabaseAdminConfigError", config instanceof SupabaseAdminConfigError);
    check("401 -> aucun retry (1 seul appel)", appels === 1);

    // 5. Dégradation gracieuse de /me : e-mail transitoirement indisponible ->
    //    profil rendu quand même, aucune exception. (buildMe() complet exige
    //    une base ; sa branche e-mail est isolée dans resolveMeEmail.)
    stubFetch([{ status: 429, body: "rate limited" }]);
    let degrade: { email?: string; emailIndisponible: boolean } | null = null;
    try {
      degrade = await resolveMeEmail(UID);
    } catch {
      degrade = null;
    }
    check("e-mail transitoirement indisponible -> /me ne jette pas", degrade !== null);
    check("e-mail transitoirement indisponible -> emailIndisponible = true", degrade?.emailIndisponible === true);
    check("e-mail transitoirement indisponible -> aucun e-mail inventé", degrade?.email === undefined);

    // 6. 404 sur /me -> incohérence réelle, on jette (pas de dégradation).
    stubFetch([{ status: 404, body: '{"msg":"User not found"}' }]);
    let jete = false;
    try {
      await resolveMeEmail(UID);
    } catch {
      jete = true;
    }
    check("compte auth introuvable (404) -> /me échoue franchement", jete);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}

/**
 * Turnstile (_lib/turnstile.ts) — les QUATRE classes, jamais confondues.
 * Avant ce lot, un unique `if (!response.ok) return false` les écrasait toutes
 * dans « robot » : une panne Cloudflare rejetait silencieusement chaque
 * soumission. Chaque test ci-dessous vérifie qu'une classe reste distinguable
 * des trois autres — c'est là tout l'intérêt du correctif.
 *
 * `fetch` global bouchonné (harnais hors ligne), puis restauré.
 */
async function checkTurnstile() {
  console.log("\nTurnstile — quatre classes : valide / refusé / panne / configuration");

  const secretOriginal = process.env.TURNSTILE_SECRET_KEY;
  process.env.TURNSTILE_SECRET_KEY = "cle_fixture_jamais_reelle";

  const fetchOriginal = globalThis.fetch;
  let appels = 0;

  function stubFetch(reponses: { status: number; body?: string }[]) {
    appels = 0;
    globalThis.fetch = (async () => {
      const r = reponses[Math.min(appels, reponses.length - 1)]!;
      appels++;
      return new Response(r.body ?? "", { status: r.status });
    }) as typeof globalThis.fetch;
  }

  /** Panne réseau : `fetch` jette, aucune réponse HTTP n'existe. */
  function stubFetchReseau() {
    appels = 0;
    globalThis.fetch = (async () => {
      appels++;
      throw new TypeError("fetch failed");
    }) as typeof globalThis.fetch;
  }

  try {
    // CLASSE 1 — 200 + success:true.
    stubFetch([{ status: 200, body: '{"success":true}' }]);
    const valide = await verifierTurnstile("jeton-fixture");
    check("200 + success:true -> valide", valide.verdict === "valide");
    check("valide -> un seul appel", appels === 1);

    // CLASSE 2 — 200 + success:false : Cloudflare a répondu, et il dit non.
    // C'est un verdict, pas une panne : aucun retry, aucune exception.
    stubFetch([{ status: 200, body: '{"success":false,"error-codes":["invalid-input-response"]}' }]);
    const refuse = await verifierTurnstile("jeton-fixture");
    check("200 + success:false -> refusé (jamais une exception)", refuse.verdict === "refuse");
    check(
      "refusé -> codes Cloudflare conservés pour le diagnostic",
      refuse.verdict === "refuse" && refuse.codes.includes("invalid-input-response")
    );
    check("refusé -> aucun retry (1 seul appel)", appels === 1);

    // Token absent : le widget n'a rien produit — la vérification n'a pas eu
    // lieu côté client. C'est un refus, pas une panne, et aucun appel réseau.
    stubFetch([{ status: 200, body: '{"success":true}' }]);
    const sansJeton = await verifierTurnstile(null);
    check("jeton absent -> refusé", sansJeton.verdict === "refuse");
    check(
      "jeton absent -> code missing-input-response",
      sansJeton.verdict === "refuse" && sansJeton.codes.includes("missing-input-response")
    );
    check("jeton absent -> aucun appel à Cloudflare", appels === 0);

    // Panne transitoire qui se résorbe : 500 puis 200 -> succès après retry.
    stubFetch([{ status: 500, body: "boom" }, { status: 200, body: '{"success":true}' }]);
    const apresRetry = await verifierTurnstile("jeton-fixture");
    check("500 puis 200 -> valide après retry", apresRetry.verdict === "valide");
    check("500 puis 200 -> exactement 2 appels", appels === 2);

    // CLASSE 3 — 5xx persistant : panne d'infrastructure, JAMAIS « robot ».
    stubFetch([{ status: 503, body: "indisponible" }]);
    let panne: unknown = null;
    try {
      await verifierTurnstile("jeton-fixture");
    } catch (err) {
      panne = err;
    }
    check("5xx persistant -> TurnstileIndisponibleError", panne instanceof TurnstileIndisponibleError);
    check(
      "5xx persistant -> statut réel porté par l'erreur",
      panne instanceof TurnstileIndisponibleError && panne.status === 503
    );
    check("5xx persistant -> tentatives bornées (3 appels max)", appels === 3);

    // CLASSE 3 (bis) — 429 : quota, pas une faute de l'utilisateur.
    stubFetch([{ status: 429, body: "rate limited" }]);
    let quota: unknown = null;
    try {
      await verifierTurnstile("jeton-fixture");
    } catch (err) {
      quota = err;
    }
    check("429 persistant -> TurnstileIndisponibleError (pas un refus)", quota instanceof TurnstileIndisponibleError);

    // CLASSE 3 (ter) — panne réseau : aucune réponse HTTP, status null.
    stubFetchReseau();
    let reseau: unknown = null;
    try {
      await verifierTurnstile("jeton-fixture");
    } catch (err) {
      reseau = err;
    }
    check("panne réseau -> TurnstileIndisponibleError", reseau instanceof TurnstileIndisponibleError);
    check(
      "panne réseau -> statut null (aucune réponse HTTP reçue)",
      reseau instanceof TurnstileIndisponibleError && reseau.status === null
    );
    check("panne réseau -> tentatives bornées", appels === 3);

    // CLASSE 4 — 401/403 : NOTRE clé est morte. Fail-closed, aucun retry
    // (retenter une clé révoquée ne fait que retarder le diagnostic —
    // incident du 19/07/2026).
    stubFetch([{ status: 401, body: '{"message":"invalid secret"}' }]);
    let config: unknown = null;
    try {
      await verifierTurnstile("jeton-fixture");
    } catch (err) {
      config = err;
    }
    check("401 -> TurnstileConfigError", config instanceof TurnstileConfigError);
    check("401 -> jamais confondu avec une panne", !(config instanceof TurnstileIndisponibleError));
    check("401 -> aucun retry (1 seul appel)", appels === 1);

    stubFetch([{ status: 403, body: "forbidden" }]);
    let interdit: unknown = null;
    try {
      await verifierTurnstile("jeton-fixture");
    } catch (err) {
      interdit = err;
    }
    check("403 -> TurnstileConfigError", interdit instanceof TurnstileConfigError);
    check("403 -> aucun retry", appels === 1);

    // CLASSE 4 (bis) — clé absente : misconfiguration, même classe qu'un 401.
    delete process.env.TURNSTILE_SECRET_KEY;
    stubFetch([{ status: 200, body: '{"success":true}' }]);
    let sansCle: unknown = null;
    try {
      await verifierTurnstile("jeton-fixture");
    } catch (err) {
      sansCle = err;
    }
    check("TURNSTILE_SECRET_KEY absent -> TurnstileConfigError", sansCle instanceof TurnstileConfigError);
    check("TURNSTILE_SECRET_KEY absent -> aucun appel à Cloudflare", appels === 0);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (secretOriginal === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = secretOriginal;
  }
}

/**
 * Commentaires — « aucun commentaire » et « chargement impossible » sont deux
 * faits différents. Avant ce lot, `if (!response.ok) return []` affichait
 * « Commentaires (0) » sur un deal qui en avait : une panne d'API devenait une
 * affirmation fausse à l'écran.
 */
async function checkCommentaires() {
  console.log("\nCommentaires — succès / vide / échec de chargement");

  const unCommentaire = { pseudo: "Amine", couleurAvatar: "#2F6B57", contenu: "Bon plan", createdAt: "2026-07-26T10:00:00.000Z" };

  const ok = await lireCommentaires("abc123", async () => Response.json({ data: [unCommentaire] }));
  check("200 avec données -> ok", ok.ok === true);
  check("200 avec données -> liste rendue", ok.ok === true && ok.commentaires.length === 1);

  // Vide LÉGITIME : la discussion existe, elle est simplement sans message.
  const vide = await lireCommentaires("abc123", async () => Response.json({ data: [] }));
  check("200 avec liste vide -> ok (vide légitime, pas un échec)", vide.ok === true);
  check("200 avec liste vide -> aucune erreur affichée", vide.ok === true && vide.commentaires.length === 0);

  // Échec : distinguable du vide. C'est tout l'objet du correctif.
  const cinqCent = await lireCommentaires("abc123", async () => new Response("boom", { status: 500 }));
  check("500 -> échec (jamais une liste vide)", cinqCent.ok === false);

  const quatreCentQuatre = await lireCommentaires("abc123", async () => new Response("", { status: 404 }));
  check("404 -> échec", quatreCentQuatre.ok === false);

  // Le handler jette au lieu de répondre (base injoignable).
  const jete = await lireCommentaires("abc123", async () => {
    throw new Error("base injoignable");
  });
  check("handler en exception -> échec (la page reste servie)", jete.ok === false);

  // 200 mais corps inexploitable : un échec de lecture, pas une liste vide.
  const corpsCasse = await lireCommentaires("abc123", async () => Response.json({ donnees: [] }));
  check("200 sans tableau data -> échec (jamais déguisé en liste vide)", corpsCasse.ok === false);

  const jsonIllisible = await lireCommentaires("abc123", async () => new Response("pas du json", { status: 200 }));
  check("200 avec JSON illisible -> échec", jsonIllisible.ok === false);
}

console.log("\nog:image — extraction depuis HTML");
check(
  "og:image trouvé (attribut property avant content)",
  extractImageUrl('<html><head><meta property="og:image" content="https://ex.com/a.jpg"></head></html>', "https://ex.com/page") ===
    "https://ex.com/a.jpg"
);
check(
  "og:image trouvé (attribut content avant property, ordre inversé)",
  extractImageUrl('<meta content="https://ex.com/b.jpg" property="og:image">', "https://ex.com/page") ===
    "https://ex.com/b.jpg"
);
check(
  "og:image absent -> repli twitter:image",
  extractImageUrl('<meta name="twitter:image" content="https://ex.com/c.jpg">', "https://ex.com/page") ===
    "https://ex.com/c.jpg"
);
check(
  "og:image et twitter:image absents -> repli <link rel=image_src>",
  extractImageUrl('<link rel="image_src" href="https://ex.com/d.jpg">', "https://ex.com/page") === "https://ex.com/d.jpg"
);
check(
  "URL relative résolue contre l'URL de la page",
  extractImageUrl('<meta property="og:image" content="/img/e.jpg">', "https://ex.com/produit/123") ===
    "https://ex.com/img/e.jpg"
);
check(
  "aucune des trois sources -> null",
  extractImageUrl("<html><head><title>Rien ici</title></head></html>", "https://ex.com/page") === null
);
check(
  "guillemets simples acceptés",
  extractImageUrl("<meta property='og:image' content='https://ex.com/f.jpg'>", "https://ex.com/page") ===
    "https://ex.com/f.jpg"
);

console.log("\nsniffImageMime — détection par magic bytes (jamais le Content-Type déclaré)");
const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const validWebp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from("WEBP")]);
// .exe renommé .jpg — l'en-tête DOS "MZ" ne correspond à aucune signature
// image, rejeté quel que soit le nom de fichier ou le Content-Type déclaré
// par le client au moment de l'upload.
const fakeExeAsJpg = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
const plainText = Buffer.from("Ceci n'est pas du tout une image, juste du texte brut.");

check("JPEG valide -> image/jpeg", sniffImageMime(validJpeg) === "image/jpeg");
check("PNG valide -> image/png", sniffImageMime(validPng) === "image/png");
check("WebP valide -> image/webp", sniffImageMime(validWebp) === "image/webp");
check(".exe renommé .jpg -> rejeté (null)", sniffImageMime(fakeExeAsJpg) === null);
check("texte brut -> rejeté (null)", sniffImageMime(plainText) === null);
check("buffer vide -> rejeté (null)", sniffImageMime(Buffer.alloc(0)) === null);
check("buffer trop court pour toute signature -> rejeté (null)", sniffImageMime(Buffer.from([0xff, 0xd8])) === null);

console.log("\ndealOgDescription — incident du 20/07/2026 : jamais le titre, jamais la description produit");
check(
  "prix barré + enseigne -> \"{prix} DH au lieu de {prix barré} DH (-{remise}%) · {enseigne}\"",
  dealOgDescription({ prixPromo: 599, prixNormal: 999, enseigneNom: "Decathlon", nomVendeur: undefined }) ===
    "599 DH au lieu de 999 DH (-40%) · Decathlon"
);
check(
  "prix barré sans enseigne (ni enseigneNom ni nomVendeur) -> pas de \"·\" final",
  dealOgDescription({ prixPromo: 599, prixNormal: 999, enseigneNom: undefined, nomVendeur: undefined }) ===
    "599 DH au lieu de 999 DH (-40%)"
);
check(
  "enseigneNom absent -> repli sur nomVendeur (vendeur informel, CONTRAT-V1 §3)",
  dealOgDescription({ prixPromo: 50, prixNormal: 100, enseigneNom: undefined, nomVendeur: "Hanout Rachid" }) ===
    "50 DH au lieu de 100 DH (-50%) · Hanout Rachid"
);
check(
  "pas de prix barré + enseigne -> \"Bon plan chez {enseigne}\"",
  dealOgDescription({ prixPromo: 99, prixNormal: undefined, enseigneNom: "Marjane", nomVendeur: undefined }) ===
    "Bon plan chez Marjane"
);
check(
  "ni prix barré ni enseigne -> repli minimal \"{prix} DH\"",
  dealOgDescription({ prixPromo: 99, prixNormal: undefined, enseigneNom: undefined, nomVendeur: undefined }) === "99 DH"
);
check(
  "prixNormal <= prixPromo (donnée incohérente) -> traité comme \"pas de remise\", jamais un pourcentage négatif/nul",
  dealOgDescription({ prixPromo: 100, prixNormal: 80, enseigneNom: "Jumia", nomVendeur: undefined }) ===
    "Bon plan chez Jumia"
);

console.log("\ntruncateOgTitle — coupe sur un espace, jamais en plein mot, ~70 caractères");
const titreCourt = "Bodyboard BB 500 confirmé";
check("titre court (<70) -> inchangé", truncateOgTitle(titreCourt) === titreCourt);
const titreLong =
  "Bodyboard BB 500 confirmé Double stringer - Grey yellow Jaune gris avec leash biceps poignet fourni et housse";
const tronque = truncateOgTitle(titreLong);
check("titre long (>70) -> tronqué avec ellipse finale", tronque.endsWith("…") && tronque.length <= 71);
check("titre long -> jamais coupé en plein mot (se termine par …, pas par un mot amputé collé)", !tronque.slice(0, -1).endsWith(" "));
check(
  "aucun espace exploitable avant `max` -> coupe brute plutôt qu'un titre quasi vide",
  truncateOgTitle("a".repeat(50) + " b", 10, 20).length <= 11
);

console.log("\nbuildShareText — sans titre, sans préfixe \"Fidwastafid :\" (incident du 20/07/2026)");
check(
  "avec remise -> \"{prix} DH (-{remise}%)\\n{url}\"",
  buildShareText(599, 999, "https://fidwastafid.com/deal/x-abc123defg") ===
    "599 DH (-40%)\nhttps://fidwastafid.com/deal/x-abc123defg"
);
check(
  "sans prixNormal -> pas de parenthèse de remise",
  buildShareText(99, undefined, "https://fidwastafid.com/deal/y-hij456klmn") ===
    "99 DH\nhttps://fidwastafid.com/deal/y-hij456klmn"
);
check(
  "prixNormal <= prixPromo (incohérent) -> traité comme sans remise",
  buildShareText(100, 80, "https://fidwastafid.com/deal/z") === "100 DH\nhttps://fidwastafid.com/deal/z"
);
check("jamais \"Fidwastafid :\" dans le texte", !buildShareText(599, 999, "https://fidwastafid.com/deal/x").includes("Fidwastafid"));

console.log("\ndealJsonLd — Product/Offer schema.org (lot GEO du 21/07/2026, constats curl prod)");
const dealJsonLdBase: Deal = {
  publicId: "abc23456de",
  titre: "Deal test JSON-LD",
  categorie: "Autre",
  type: "en_ligne",
  prixPromo: 100,
  statut: "publie",
  score: 0,
  submitterPublicId: null,
  submitterPseudo: null,
  submitterCouleurAvatar: null,
  commentairesCount: 0,
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
};

const avecPhoto = dealJsonLd({ ...dealJsonLdBase, imageKey: "deals/abc23456de.webp" }, "/deal/x-abc23456de");
check(
  "deal avec imageKey -> image = URL absolue /img/deals/{publicId} (jamais opengraph-image générique, jamais Supabase)",
  avecPhoto.image === "https://fidwastafid.com/img/deals/abc23456de"
);

const sansPhoto = dealJsonLd(dealJsonLdBase, "/deal/x-abc23456de");
check(
  "deal sans imageKey -> repli sur l'image générique du site",
  sansPhoto.image === "https://fidwastafid.com/opengraph-image"
);

const publie = dealJsonLd({ ...dealJsonLdBase, statut: "publie" }, "/deal/x-abc23456de");
check("statut publie -> availability InStock", publie.offers.availability === "https://schema.org/InStock");

const expire = dealJsonLd({ ...dealJsonLdBase, statut: "expire", dateFin: "2026-01-01" }, "/deal/x-abc23456de");
check(
  "statut expire -> availability SoldOut (pas OutOfStock, offre définitivement terminée)",
  expire.offers.availability === "https://schema.org/SoldOut"
);
check(
  "statut expire + dateFin présente -> priceValidUntil quand même inclus (fait honnête, pas une promesse)",
  expire.offers.priceValidUntil === "2026-01-01"
);

const sansDateFin = dealJsonLd(dealJsonLdBase, "/deal/x-abc23456de");
check("pas de dateFin -> pas de priceValidUntil", !("priceValidUntil" in sansDateFin.offers));

const avecEnseigne = dealJsonLd({ ...dealJsonLdBase, enseigneNom: "Carrefour" }, "/deal/x-abc23456de");
check(
  "enseigneNom présent -> offers.seller Organization (constat : \"chez carrefour\" visible en description mais absent du JSON-LD avant ce lot)",
  JSON.stringify(avecEnseigne.offers.seller) === JSON.stringify({ "@type": "Organization", name: "Carrefour" })
);

const sansEnseigne = dealJsonLd(dealJsonLdBase, "/deal/x-abc23456de");
check("enseigneNom absent -> pas de champ seller inventé", !("seller" in sansEnseigne.offers));

check("offers.priceCurrency toujours MAD", publie.offers.priceCurrency === "MAD");
check("offers.price est un nombre (pas une chaîne, pas de symbole)", typeof publie.offers.price === "number" && publie.offers.price === 100);
check(
  "JSON-LD sérialisable et re-parsable (forme réellement injectée dans le <script>)",
  JSON.parse(JSON.stringify(publie))["@type"] === "Product" && JSON.parse(JSON.stringify(publie)).offers["@type"] === "Offer"
);

/**
 * Pagination du feed — incident du 26/07/2026 : 57 des 81 deals publiés
 * invisibles, `nextCursor` typé mais jamais consommé. Ces cas verrouillent les
 * trois propriétés qui font qu'une pagination par curseur reste correcte :
 * elle accumule, elle ne duplique pas, elle s'arrête.
 */
console.log("\nPagination du feed — accumulation, doublons, arrêt");

function dealFictif(publicId: string): Deal {
  return { ...dealJsonLdBase, publicId };
}

// -- Construction des paramètres : le curseur part VERBATIM.
// « Partout » est l'ABSENCE de filtre de disponibilité, et se représente par
// la chaîne vide depuis le lot 7 (avant : la valeur sentinelle "tous", qui
// ressemblait à une valeur d'enum sans en être une).
const paramsSansCurseur = construireParamsFeed({ tri: "tendance", type: "" });
check("params : limit = taille de page", paramsSansCurseur.get("limit") === String(TAILLE_PAGE));
check("params : « partout » n'est pas transmis (absence de filtre)", paramsSansCurseur.get("type") === null);
check("params : pas de cursor sur la première page", paramsSansCurseur.get("cursor") === null);

const curseurOpaque = "eyJ0cmkiOiJ0ZW5kYW5jZSIsImFzT2YiOiIyMDI2LTA3LTI2VDE4OjQ2OjE4LjQyMloifQ";
const paramsAvecCurseur = construireParamsFeed({
  tri: "tendance",
  ville: "Casablanca",
  categorie: "Mode",
  type: "physique",
  cursor: curseurOpaque,
});
check("params : curseur retransmis tel quel (asOf/publicId préservés)", paramsAvecCurseur.get("cursor") === curseurOpaque);
check("params : filtres actifs transmis", paramsAvecCurseur.get("ville") === "Casablanca" && paramsAvecCurseur.get("type") === "physique");

// -- Accumulation sur plusieurs pages.
const page1 = [dealFictif("aaaaaaaaa1"), dealFictif("aaaaaaaaa2"), dealFictif("aaaaaaaaa3")];
const page2 = [dealFictif("bbbbbbbbb1"), dealFictif("bbbbbbbbb2")];
let accumule = fusionnerSansDoublon([], page1);
accumule = fusionnerSansDoublon(accumule, page2);
check("2 pages -> les deux sont accumulées", accumule.length === 5);
check("2 pages -> l'ordre de service est conservé", accumule[0]!.publicId === "aaaaaaaaa1" && accumule[4]!.publicId === "bbbbbbbbb2");

// -- Doublon entre pages (curseur mal départagé) : écarté en silence, jamais rendu deux fois.
const page3AvecRepetition = [dealFictif("bbbbbbbbb2"), dealFictif("ccccccccc1")];
const apresPage3 = fusionnerSansDoublon(accumule, page3AvecRepetition);
check("doublon inter-pages écarté", apresPage3.length === 6);
check(
  "aucun publicId présent deux fois",
  new Set(apresPage3.map((d) => d.publicId)).size === apresPage3.length
);

// -- Doublon INTERNE à une même page.
const pageAvecDoublonInterne = [dealFictif("ddddddddd1"), dealFictif("ddddddddd1"), dealFictif("ddddddddd2")];
const apresInterne = fusionnerSansDoublon([], pageAvecDoublonInterne);
check("doublon interne à une page écarté", apresInterne.length === 2);

// -- Page vide (fin de liste) : ne casse rien, ne duplique rien.
check("page vide -> liste inchangée", fusionnerSansDoublon(apresPage3, []).length === apresPage3.length);

// -- Simulation complète : 81 deals, pages de 24, arrêt quand nextCursor = null.
{
  const total = 81;
  const tous = Array.from({ length: total }, (_, i) => dealFictif(`deal${String(i).padStart(6, "0")}`));
  let charges: Deal[] = [];
  let offset = 0;
  let cursor: string | null = "debut";
  let pages = 0;
  while (cursor !== null && pages < 20) {
    const lot = tous.slice(offset, offset + TAILLE_PAGE);
    offset += lot.length;
    charges = fusionnerSansDoublon(charges, lot);
    cursor = offset < total ? `curseur-${offset}` : null; // l'API renvoie null en fin de liste
    pages++;
  }
  check("parcours complet -> 81 deals chargés", charges.length === total);
  check("parcours complet -> 4 pages (24+24+24+9)", pages === 4);
  check("parcours complet -> arrêt sur nextCursor null", cursor === null);
  check("parcours complet -> aucun doublon", new Set(charges.map((d) => d.publicId)).size === total);
}

// -- Messages d'erreur : jamais un silence.
check("erreur 429 -> message spécifique", messageErreurFeed(429).includes("Trop de requêtes"));
check("erreur 5xx -> message serveur", messageErreurFeed(503).includes("serveur"));
check("erreur réseau -> message générique non vide", messageErreurFeed().length > 0);

// ---------------------------------------------------------------------------
// Journal d'audit — un diff qui ne mentionne QUE ce qui a changé.
//
// Fait générateur : entrée journal_audit #240 du 27/07/2026. Un enregistrement
// du formulaire d'édition sans aucun changement a produit
// `prixPromo: "100.00" -> 100` (colonne numeric renvoyée en chaîne par pg,
// comparée à un nombre JS) et quatre autres champs identiques de part et
// d'autre. Un journal qui enregistre de faux changements perd sa valeur
// probante.
// ---------------------------------------------------------------------------
console.log("\nJournal d'audit — normalisation avant comparaison");

// Le cas exact de l'entrée #240.
check(
  'numeric "100.00" vs nombre 100 -> aucun changement',
  Object.keys(champsModifies({ prixPromo: { avant: "100.00", apres: 100, sorte: "nombre" } })).length === 0
);
check(
  'numeric "119.99" vs nombre 119.99 -> aucun changement',
  Object.keys(champsModifies({ prixNormal: { avant: "119.99", apres: 119.99, sorte: "nombre" } })).length === 0
);
// bigint : même écart de type, sur enseigne_id (le typer `number` le masquait).
check(
  'bigint "3" vs nombre 3 -> aucun changement',
  Object.keys(champsModifies({ enseigneSlug: { avant: "3", apres: 3, sorte: "nombre" } })).length === 0
);

// Un vrai changement doit toujours ressortir — et en forme normalisée.
{
  const diff = champsModifies({ prixPromo: { avant: "100.00", apres: 89.9, sorte: "nombre" } });
  check("changement réel de prix -> retenu", "prixPromo" in diff);
  check("valeur avant normalisée en nombre", diff.prixPromo?.avant === 100);
  check("valeur après conservée", diff.prixPromo?.apres === 89.9);
}

// Texte, booléen, null/undefined.
check(
  "texte identique -> aucun changement",
  Object.keys(champsModifies({ titre: { avant: "Test turn", apres: "Test turn", sorte: "texte" } })).length === 0
);
check(
  "texte modifié -> retenu",
  "titre" in champsModifies({ titre: { avant: "Test turn", apres: "Test tour", sorte: "texte" } })
);
check(
  "booléen identique -> aucun changement",
  Object.keys(champsModifies({ whatsappPublic: { avant: false, apres: false, sorte: "booleen" } })).length === 0
);
check(
  "booléen modifié -> retenu",
  "whatsappPublic" in champsModifies({ whatsappPublic: { avant: false, apres: true, sorte: "booleen" } })
);
check(
  "null en base vs undefined dans le patch -> aucun changement",
  Object.keys(champsModifies({ ville: { avant: null, apres: undefined, sorte: "texte" } })).length === 0
);
check(
  "null en base vs valeur fournie -> retenu",
  "ville" in champsModifies({ ville: { avant: null, apres: "Casablanca", sorte: "texte" } })
);

// Le cas complet de #240 : cinq champs renvoyés à l'identique -> diff vide.
check(
  "enregistrement sans modification -> diff vide (cas de l'entrée #240)",
  Object.keys(
    champsModifies({
      titre: { avant: "Test turn", apres: "Test turn", sorte: "texte" },
      type: { avant: "physique", apres: "physique", sorte: "texte" },
      categorie: { avant: "Alimentaire", apres: "Alimentaire", sorte: "texte" },
      prixPromo: { avant: "100.00", apres: 100, sorte: "nombre" },
      prixNormal: { avant: "119.99", apres: 119.99, sorte: "nombre" },
      whatsappPublic: { avant: false, apres: false, sorte: "booleen" },
    })
  ).length === 0
);

// Valeur non convertible : ni NaN (qui différerait de lui-même à chaque
// écriture), ni null (qui confondrait deux valeurs distinctes).
check("nombre illisible -> chaîne brute conservée", normaliserValeurAudit("abc", "nombre") === "abc");
check(
  "deux valeurs illisibles différentes -> changement détecté",
  "prixPromo" in champsModifies({ prixPromo: { avant: "abc", apres: "def", sorte: "nombre" } })
);

// ---------------------------------------------------------------------------
// Motif de rejet obligatoire — CONTRAT-V1 §3, sur l'état RÉSULTANT.
// ---------------------------------------------------------------------------
console.log("\nMotif de rejet — obligation sur l'état résultant");
check("rejet sans motif -> manquant", motifRejetManquant("rejete", null));
check("rejet avec motif vide -> manquant", motifRejetManquant("rejete", ""));
check("rejet avec motif d'espaces -> manquant", motifRejetManquant("rejete", "   "));
check("rejet motivé -> conforme", !motifRejetManquant("rejete", "Doublon"));
check(
  "édition d'un deal déjà rejeté, motif déjà en base -> conforme (pas de renvoi exigé)",
  !motifRejetManquant("rejete", "Prix erroné")
);
check("publication sans motif -> conforme", !motifRejetManquant("publie", null));
check("mise en attente sans motif -> conforme", !motifRejetManquant("en_attente", null));
check("motif exigé seulement pour rejete", !motifRejetManquant("expire", null));

// ---------------------------------------------------------------------------
// Lot 7 — filtres du feed.
//
// Ces vérifications sont HORS LIGNE : elles portent sur la construction des
// prédicats et sur la logique d'interface, pas sur le résultat d'une requête.
// L'égalité empiriquement mesurée « compteur == lignes réellement renvoyées »
// exige une vraie base et vit dans tests/integration.ts ; ici on verrouille
// ce qui la rend structurellement vraie : les deux endpoints construisent
// leurs conditions avec LES MÊMES fonctions.
// ---------------------------------------------------------------------------

function filtres(partiel: Partial<Parameters<typeof signatureFiltres>[0]> = {}) {
  return { statut: "publie", enseigne: null, ville: null, categorie: null, type: null, q: null, ...partiel };
}

console.log("\nFiltres — ville et deals en ligne (CONTRAT-V1 §3, lot 7)");
{
  const l: Lieur = { values: [] };
  const sql = conditionVille(filtres({ ville: "Casablanca" }), l, "d");
  check("choisir une ville lie la ville en paramètre", l.values[0] === "Casablanca");
  check("… et retient les deals de cette ville", sql.includes("d.ville = $1"));
  check("… PLUS les deals nationaux", sql.includes("d.ville = 'National'"));
  check("… PLUS les deals disponibles en ligne", sql.includes("d.type in ('en_ligne', 'les_deux')"));
  check("aucune ville choisie -> aucune restriction", conditionVille(filtres(), { values: [] }, "d") === "true");
}

// « En boutique »/« En ligne » se lisent en DISPONIBILITÉ : un deal
// `les_deux` appartient aux deux ensembles, il ne doit disparaître d'aucun.
check(
  "« en boutique » retient aussi les deals disponibles des deux façons",
  conditionType(filtres({ type: "physique" }), { values: [] }, "d") === "d.type in ('physique', 'les_deux')"
);
check(
  "« en ligne » retient aussi les deals disponibles des deux façons",
  conditionType(filtres({ type: "en_ligne" }), { values: [] }, "d") === "d.type in ('en_ligne', 'les_deux')"
);

// La ville est SANS OBJET quand « en ligne » est demandé : normalisée à
// l'entrée, côté serveur comme côté client. Sans ça, une URL fabriquée à la
// main produirait une liste et un compteur qui ne se ressemblent pas.
{
  const lu = lireFiltres(new URLSearchParams("type=en_ligne&ville=Casablanca"));
  check("« en ligne » + ville -> la ville est effacée côté serveur", lu.ville === null);
  check(
    "… et la signature est celle de « en ligne » seul",
    signatureFiltres(lu) === signatureFiltres(lireFiltres(new URLSearchParams("type=en_ligne")))
  );
}
check(
  "une ville hors de la liste fermée est ignorée",
  lireFiltres(new URLSearchParams("ville=Tombouctou")).ville === null
);

console.log("\nCompteurs — mêmes prédicats que la liste");
{
  const f = filtres({ ville: "Rabat", categorie: "Mode", type: "physique", q: "tv" });
  const { text } = requeteFacettes(f);

  // Chaque fragment que la LISTE utilisera doit apparaître tel quel dans la
  // requête de comptage — c'est ce qui interdit à un compteur de compter
  // autrement que ce que le filtre renverra.
  // Mêmes alias et même ORDRE de liaison que requeteFacettes : les `$n`
  // reconstruits ici doivent coïncider avec ceux de la requête réelle.
  const lListe: Lieur = { values: [] };
  const base = conditionsBase(f, lListe, "d").join(" and ");
  const ville = conditionVille(f, lListe, "b");
  const categorie = conditionCategorie(f, lListe, "b");
  const type = conditionType(f, lListe, "b");

  check("la requête de comptage porte le même filtre de statut/enseigne/recherche", text.includes(base.split(" and ")[0] ?? ""));
  check("… le même prédicat de ville", text.includes(ville));
  check("… le même prédicat de catégorie", text.includes(categorie));
  check("… le même prédicat de disponibilité", text.includes(type));
  check("la recherche est bien un filtre SERVEUR", base.includes("ilike"));
  check("les jokers LIKE d'une saisie sont échappés", requeteFacettes(filtres({ q: "100%" })).values.includes("%100\\%%"));

  // Le compteur d'une dimension ignore SON PROPRE filtre et applique les
  // autres : « combien si je choisis cette catégorie, à ville constante ».
  const catsBloc = text.slice(text.indexOf("cats as ("), text.indexOf("vls as ("));
  check("le compteur de catégorie n'applique pas le filtre de catégorie", !catsBloc.includes(categorie));
  check("… mais applique bien celui de ville", catsBloc.includes(ville));
}

check(
  "les compteurs sont demandés avec exactement les filtres de la liste, sans pagination",
  construireParamsFacettes({ tri: "recent", ville: "Rabat", q: "tv", cursor: "abc" }).toString() ===
    "ville=Rabat&q=tv"
);

check(
  "une valeur d'enum sans aucun deal ressort à 0 plutôt que de disparaître",
  assemblerFacettes([
    { dim: "total", valeur: "", n: 3 },
    { dim: "categorie", valeur: "Mode", n: 3 },
    { dim: "categorie", valeur: "Gaming", n: 0 },
  ]).categories.some((c) => c.valeur === "Gaming" && c.n === 0)
);

console.log("\nCurseur — réinitialisation au changement de filtre (étape 8)");
{
  const aRabat = signatureFiltres(lireFiltres(new URLSearchParams("ville=Rabat")));
  const aCasa = signatureFiltres(lireFiltres(new URLSearchParams("ville=Casablanca")));
  check("deux jeux de filtres différents ont des signatures différentes", aRabat !== aCasa);
  check(
    "deux URL équivalentes ont la même signature (pagination non cassée pour rien)",
    signatureFiltres(lireFiltres(new URLSearchParams("ville=Rabat&limit=24"))) === aRabat
  );

}

/**
 * Refus vérifié sur le VRAI handler : il tranche AVANT toute requête SQL,
 * donc sans base de données — c'est justement ce qui rend la garantie
 * testable ici plutôt qu'en intégration seulement.
 */
async function checkCurseurFiltres() {
  console.log("\nCurseur — refus par le handler (aucune requête SQL atteinte)");
  const aRabat = signatureFiltres(lireFiltres(new URLSearchParams("ville=Rabat")));
  const curseurPerime = encodeCursor({ tri: "tendance", value: "1", publicId: "abcdefghij", filtres: aRabat });

  const res = await getDeals(
    new Request(`http://localhost/api/v1/deals?ville=Casablanca&cursor=${encodeURIComponent(curseurPerime)}`)
  );
  const body = (await res.json()) as { error?: { code: string } };
  check("un curseur d'un autre jeu de filtres est refusé (400)", res.status === 400);
  check("… avec le code d'erreur du contrat", body.error?.code === "VALIDATION_ERROR");

  // Un curseur d'avant ce lot (sans signature) n'est plus décodable : il est
  // rejeté au lieu d'être appliqué à l'aveugle sur un jeu inconnu.
  const ancienFormat = Buffer.from(JSON.stringify({ tri: "tendance", value: "1", publicId: "abcdefghij" })).toString(
    "base64url"
  );
  const resAncien = await getDeals(new Request(`http://localhost/api/v1/deals?cursor=${ancienFormat}`));
  check("un curseur sans signature de filtres est refusé", resAncien.status === 400);
}

console.log("\nFeuille — une option vide ne doit pas pouvoir enfermer");
check("catégorie à 0 deal -> non sélectionnable", optionDesactivee({ n: 0, choisi: false }));
check(
  "catégorie à 0 deal MAIS déjà choisie -> reste sélectionnable (sinon on ne peut plus en sortir)",
  !optionDesactivee({ n: 0, choisi: true })
);
check("catégorie non vide -> sélectionnable", !optionDesactivee({ n: 4, choisi: false }));
check("compteur pas encore chargé -> ne désactive rien", !optionDesactivee({ n: null, choisi: false }));
check("dimension sans objet -> désactivée quel que soit le compteur", optionDesactivee({ n: 9, choisi: false, sansObjet: true }));

console.log("\nÉtat des filtres — URL, étiquettes et rappel en clair");
{
  const etat: EtatFiltres = { categorie: "Mode", ville: "Rabat", type: "physique", tri: "recent", q: "tv" };
  check("l'état s'écrit dans l'URL", ecrireFiltresUrl(etat) === "?categorie=Mode&ville=Rabat&type=physique&tri=recent&q=tv");
  check("… et se relit à l'identique (partage et retour arrière)", ecrireFiltresUrl(lireFiltresUrl(new URLSearchParams(ecrireFiltresUrl(etat).slice(1)))) === ecrireFiltresUrl(etat));
  check("l'état par défaut ne pollue pas l'URL", ecrireFiltresUrl(FILTRES_PAR_DEFAUT) === "");
  check("« en ligne » efface la ville côté client aussi", normaliserFiltres({ ...etat, type: "en_ligne" }).ville === "");
}
check("le tri n'est pas compté comme un filtre", nbFiltresActifs({ ...FILTRES_PAR_DEFAUT, tri: "score" }) === 0);
check("la recherche n'est pas comptée (elle a son propre champ)", nbFiltresActifs({ ...FILTRES_PAR_DEFAUT, q: "tv" }) === 0);
check("trois filtres actifs -> pastille à 3", nbFiltresActifs({ categorie: "Mode", ville: "Rabat", type: "physique", tri: "tendance", q: "" }) === 3);
check(
  "le rappel en clair énumère les filtres, jamais le tri",
  resumeFiltres({ categorie: "Mode", ville: "Rabat", type: "en_ligne", tri: "score", q: "tv" }).join(" · ") ===
    "Mode · En ligne · « tv »"
);

// ---------------------------------------------------------------------------
// Fixtures d'intégration — conformité des public_id, VÉRIFIÉE HORS LIGNE.
//
// Fait générateur (28/07/2026, PR #59) : quatre fixtures ajoutées à la main
// portaient le chiffre `1`, absent de PUBLIC_ID_ALPHABET. Les `insert`
// échouaient sur `deals_public_id_check` (SQLSTATE 23514), quatre fois
// d'affilée — et uniquement dans le job `integration`, qui n'est pas bloquant
// parce que dependabot n'a pas les secrets, pas pour laisser passer une
// régression.
//
// Ces vérifications sont ICI, dans le test hors ligne, pour que la faute tombe
// dans `quality` : elle n'a besoin ni de base, ni de JWT, ni de secrets. Un
// identifiant écrit à la main est une donnée de test comme une autre — rien ne
// justifie d'attendre Postgres pour apprendre qu'il est malformé.
// ---------------------------------------------------------------------------
console.log("\nFixtures — public_id conformes à l'alphabet (CONTRAT-V1 §1)");
for (const [nom, id] of Object.entries(PUBLIC_IDS_FIXTURES)) {
  check(`fixture ${nom} (${id}) conforme`, publicIdSchema.safeParse(id).success);
}
check(
  `identifiant « introuvable » (${PUBLIC_ID_INEXISTANT}) de forme VALIDE`,
  publicIdSchema.safeParse(PUBLIC_ID_INEXISTANT).success
);
check("aucun doublon entre fixtures", new Set(TOUS_LES_PUBLIC_IDS).size === TOUS_LES_PUBLIC_IDS.length);

// Contrôle négatif : sans lui, ces vérifications passeraient tout aussi bien
// avec un schéma cassé. Ce sont les quatre valeurs réellement rejetées par
// Postgres le 28/07 qui servent de témoin.
for (const rejete of ["itgen1qa2a", "itgnat1qa2", "itgcas1qa2", "itgrab1qa2"]) {
  check(`témoin — ${rejete} (chiffre « 1 ») bien refusé`, !publicIdSchema.safeParse(rejete).success);
}
check("l'alphabet exclut 0, 1, l et o", !/[01lo]/.test(PUBLIC_ID_ALPHABET));

void runAsyncChecks();
