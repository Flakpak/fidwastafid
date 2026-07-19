import { withTransaction, closePool, query } from "@fidwastafid/db";
import { POST as postDeal } from "../src/app/api/v1/deals/route.js";
import { GET as getDeal } from "../src/app/api/v1/deals/[publicId]/route.js";
import { POST as postVote, DELETE as deleteVote } from "../src/app/api/v1/deals/[publicId]/votes/route.js";
import {
  POST as postComment,
  GET as getComments,
} from "../src/app/api/v1/deals/[publicId]/commentaires/route.js";
import { GET as getMe, PATCH as patchMe } from "../src/app/api/v1/me/route.js";
import { PATCH as patchAdminDeal } from "../src/app/api/v1/admin/deals/[publicId]/route.js";
import { POST as postImageDepuisLien } from "../src/app/api/v1/admin/deals/[publicId]/image-depuis-lien/route.js";
import { POST as postDealImage } from "../src/app/api/v1/admin/deals/[publicId]/image/route.js";
import { GET as getImgProxy } from "../src/app/img/deals/[publicId]/route.js";

/**
 * Tests d'intégration (plan v2, Phase 3 : "soumission, validation, vote") —
 * contre un vrai Postgres (service CI) et un vrai JWT Supabase (projet de
 * dev). Appelle les handlers de route directement (pas de serveur HTTP à
 * démarrer) : nos routes ne touchent que `Request`/`NextResponse`, aucune
 * API liée au contexte de requête Next.js (cookies()/headers()) — portable
 * hors du runtime Next.
 *
 * Job CI séparé de "quality" (voir .github/workflows/ci.yml) : si Supabase
 * dev est en pause (free tier), ce script échoue avec un message explicite
 * plutôt qu'une erreur réseau opaque.
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

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant — requis pour les tests d'intégration.`);
  return value;
}

async function getRealAccessToken(): Promise<{ token: string; userId: string }> {
  const supabaseUrl = readEnv("SUPABASE_URL");
  // Migration clés API Supabase terminée (19/07/2026,
  // docs/MIGRATION-CLES-SUPABASE.md) — plus de fallback vers l'ancienne clé
  // anon, désactivée côté Dashboard Supabase.
  const projectKey = readEnv("SUPABASE_PUBLISHABLE_KEY");
  const email = readEnv("TEST_USER_EMAIL");
  const password = readEnv("TEST_USER_PASSWORD");

  // Deux causes d'échec bien distinctes à ce stade, longtemps confondues
  // sous le même message générique (incident CI du 19/07/2026 : 18 runs
  // rouges d'affilée, diagnostiqués à coup de fouille de logs faute de
  // distinguer les deux) :
  // - le `fetch` lui-même échoue (DNS/connexion/timeout) -> le projet
  //   Supabase de dev est probablement en pause (free tier) ;
  // - le `fetch` aboutit mais renvoie 401/403 -> la clé API elle-même est
  //   absente, invalide ou révoquée (ex. secret GitHub manquant après une
  //   migration de clés, ou clé legacy désactivée côté Dashboard) — un
  //   redémarrage du projet ne change rien, il faut vérifier les secrets.
  const SUPABASE_DOWN_MESSAGE =
    "Supabase dev inaccessible : projet probablement en pause, le réveiller sur supabase.com.";

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: projectKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new Error(`${SUPABASE_DOWN_MESSAGE} (${(err as Error).message})`);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errBody = (await response.json()) as { message?: string; error?: string; error_description?: string };
      detail = errBody.message || errBody.error_description || errBody.error || "";
    } catch {
      // Corps d'erreur non-JSON — le statut HTTP seul reste informatif.
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Clé API Supabase rejetée (HTTP ${response.status}${detail ? ` — ${detail}` : ""}) : ` +
          "SUPABASE_PUBLISHABLE_KEY est absente, invalide ou révoquée côté secrets GitHub " +
          "— vérifie Settings > Secrets and variables > Actions, pas la peine de réveiller le projet Supabase."
      );
    }
    throw new Error(`${SUPABASE_DOWN_MESSAGE} (HTTP ${response.status}${detail ? ` — ${detail}` : ""})`);
  }

  const data = (await response.json()) as { access_token?: string; user?: { id?: string } };
  if (!data.access_token || !data.user?.id) {
    throw new Error(
      `${SUPABASE_DOWN_MESSAGE} Ou identifiants de test invalides (réponse sans access_token/user.id).`
    );
  }
  return { token: data.access_token, userId: data.user.id };
}

function authedRequest(url: string, token: string | null, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(url, { ...init, headers });
}

/**
 * Distinct de authedRequest() : un corps FormData a besoin que fetch/undici
 * pose lui-même le Content-Type multipart avec boundary — authedRequest()
 * forcerait "application/json" dès qu'un corps est présent sans en-tête
 * explicite, ce qui casserait le parsing multipart côté route.
 */
function authedFormRequest(url: string, token: string, formData: FormData, extraHeaders: HeadersInit = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, ...extraHeaders },
    body: formData,
  });
}

const ENSEIGNE_SLUG = "test-integration";
const DEAL_PUBLIC_ID = "itgd2a9qa2";

// 1x1 PNG transparent minimal — juste assez pour que sharp le décode et que
// le sniffing magic bytes le reconnaisse comme un vrai PNG. Module-scope :
// réutilisé par la soumission publique avec photo (POST /api/v1/deals) et
// par l'upload manuel admin (POST /api/v1/admin/deals/:publicId/image).
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TINY_PNG_BUFFER = Buffer.from(TINY_PNG_BASE64, "base64");
// Fixture pure DB, jamais authentifié — sert uniquement à occuper un pseudo
// pour tester le rejet d'un doublon (contrainte unique users.pseudo, migration 0006).
const AUTRE_USER_ID = "00000000-0000-4000-8000-000000000042";
const AUTRE_PSEUDO = "PseudoDejaPris";

async function seedFixtures(userId: string): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `insert into users (id, public_id, pseudo) values ($1, 'itg2p9qa23', 'IntegrationTest')
       on conflict (id) do nothing`,
      [userId]
    );
    await client.query(
      `insert into users (id, public_id, pseudo) values ($1, 'aut2p9qa23', $2)
       on conflict (id) do nothing`,
      [AUTRE_USER_ID, AUTRE_PSEUDO]
    );
    await client.query(`insert into enseignes (slug, nom) values ($1, 'Test Integration') on conflict (slug) do nothing`, [
      ENSEIGNE_SLUG,
    ]);
    // Projet de dev/test uniquement — nécessaire pour exercer PATCH
    // /api/v1/admin/deals/:publicId (motifRejet, édition curateur des
    // champs terrain) avec le même utilisateur/JWT que le reste du fichier.
    await client.query(`insert into admins (id) values ($1) on conflict (id) do nothing`, [userId]);
    // Ce fichier soumet plus de deals authentifiés (6) que la limite de
    // RATE_LIMITS.soumission (5/heure, apps/web/_lib/rateLimit.ts) — sans
    // ce reset, une ré-exécution locale rapprochée (ou un run précédent
    // dans la même fenêtre) fait échouer la soumission valide avec un faux
    // 429 sans rapport avec ce qui est testé ici.
    await client.query(`delete from rate_limits where cle like 'soumission:%'`);
  });

  const enseigneRows = await query<{ id: number }>("select id from enseignes where slug = $1", [ENSEIGNE_SLUG]);
  const enseigneId = enseigneRows[0]?.id;
  if (!enseigneId) throw new Error("Fixture enseigne introuvable après insertion.");

  await query(
    `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, submitter_id, score)
     values ($1, 'Deal test intégration', $2, 'Autre', 'physique', 1, 'publie', $3, 0)
     on conflict (public_id) do update set score = 0`,
    [DEAL_PUBLIC_ID, enseigneId, userId]
  );
}

async function main() {
  const { token, userId } = await getRealAccessToken();
  console.log(`JWT Supabase dev obtenu (user ${userId}).`);

  await seedFixtures(userId);

  // Next.js appelle toujours les routes avec un contexte, même sans segment
  // dynamique — { params: Promise<{}> } (cf. .next/types générés).
  const noParams = { params: Promise.resolve({}) };

  console.log("\nsoumission — POST /api/v1/deals");
  const submitRes = await postDeal(
    authedRequest("http://localhost/api/v1/deals", token, {
      method: "POST",
      headers: { "x-turnstile-token": "test" },
      body: JSON.stringify({
        titre: "Deal soumis par le test d'intégration",
        enseigneSlug: ENSEIGNE_SLUG,
        categorie: "Autre",
        type: "physique",
        prixPromo: 42,
      }),
    }),
    noParams
  );
  const submitBody = (await submitRes.json()) as {
    statut?: string;
    enseigneNom?: string;
    submitterPseudo?: string | null;
  };
  check("soumission valide -> 201", submitRes.status === 201);
  check("soumission valide -> statut en_attente", submitBody.statut === "en_attente");
  check("soumission valide -> enseigneNom résolu depuis la table enseignes", submitBody.enseigneNom === "Test Integration");
  check("soumission valide -> submitterPseudo résolu depuis la table users", submitBody.submitterPseudo === "IntegrationTest");

  console.log("\nvalidation — corps invalide et absence d'authentification");
  const invalidRes = await postDeal(
    authedRequest("http://localhost/api/v1/deals", token, {
      method: "POST",
      headers: { "x-turnstile-token": "test" },
      body: JSON.stringify({
        titre: "Deal en ligne sans lien",
        enseigneSlug: ENSEIGNE_SLUG,
        categorie: "Autre",
        type: "en_ligne",
        prixPromo: 10,
      }),
    }),
    noParams
  );
  check("soumission en_ligne sans lien -> 400 VALIDATION_ERROR", invalidRes.status === 400);

  const noAuthRes = await postDeal(
    authedRequest("http://localhost/api/v1/deals", null, {
      method: "POST",
      body: JSON.stringify({
        titre: "Deal sans auth",
        enseigneSlug: ENSEIGNE_SLUG,
        categorie: "Autre",
        type: "physique",
        prixPromo: 10,
      }),
    }),
    noParams
  );
  check("soumission sans token -> 401 UNAUTHENTICATED", noAuthRes.status === 401);

  // Ce bloc soumet à lui seul 4 deals authentifiés, en plus des 2 du bloc
  // précédent — un deuxième reset garde chaque bloc sous la limite de
  // RATE_LIMITS.soumission (5/heure) sans avoir à fusionner des scénarios
  // de validation distincts en un seul appel.
  await query(`delete from rate_limits where cle like 'soumission:%'`);

  console.log("\nsoumission terrain — nomVendeur/adresse/lienMaps/whatsapp (CONTRAT-V1 §3/§4, amendement 18/07/2026)");

  const terrainRes = await postDeal(
    authedRequest("http://localhost/api/v1/deals", token, {
      method: "POST",
      headers: { "x-turnstile-token": "test" },
      body: JSON.stringify({
        titre: "Hanout test intégration",
        categorie: "Autre",
        type: "physique",
        prixPromo: 15,
        nomVendeur: "Hanout Test",
        adresse: "12 Rue Test, Casablanca",
        lienMaps: "https://www.google.com/maps/place/Hanout+Test",
        // Format humain réel (espaces), pas la forme déjà propre — bug prod
        // du 19/07/2026 : ce format faisait échouer toute la soumission.
        whatsappContact: "06 12 34 56 78",
        whatsappPublic: true,
      }),
    }),
    noParams
  );
  const terrainBody = (await terrainRes.json()) as {
    publicId?: string;
    nomVendeur?: string;
    adresse?: string;
    lienMaps?: string;
    whatsappContact?: string;
  };
  check("soumission terrain valide -> 201", terrainRes.status === 201);
  check("soumission terrain -> nomVendeur conservé", terrainBody.nomVendeur === "Hanout Test");
  check("soumission terrain -> adresse conservée", terrainBody.adresse === "12 Rue Test, Casablanca");
  check(
    "soumission terrain -> lienMaps conservé",
    terrainBody.lienMaps === "https://www.google.com/maps/place/Hanout+Test"
  );
  check("soumission terrain -> whatsappContact normalisé en +212", terrainBody.whatsappContact === "+212612345678");
  const terrainPublicId = terrainBody.publicId;
  if (!terrainPublicId) throw new Error("publicId du deal terrain manquant après soumission.");

  const lienMapsInvalideRes = await postDeal(
    authedRequest("http://localhost/api/v1/deals", token, {
      method: "POST",
      headers: { "x-turnstile-token": "test" },
      body: JSON.stringify({
        titre: "Deal lienMaps invalide",
        categorie: "Autre",
        type: "physique",
        prixPromo: 15,
        lienMaps: "https://example.com/maps/place/Faux",
      }),
    }),
    noParams
  );
  const lienMapsInvalideBody = (await lienMapsInvalideRes.json()) as { error?: { fields?: Record<string, string> } };
  check("lienMaps hors liste blanche -> 400 VALIDATION_ERROR", lienMapsInvalideRes.status === 400);
  check(
    "lienMaps invalide -> détail du champ fautif fourni (fields)",
    typeof lienMapsInvalideBody.error?.fields?.lienMaps === "string"
  );

  const whatsappSansNumeroRes = await postDeal(
    authedRequest("http://localhost/api/v1/deals", token, {
      method: "POST",
      headers: { "x-turnstile-token": "test" },
      body: JSON.stringify({
        titre: "Deal whatsappPublic sans numéro",
        categorie: "Autre",
        type: "physique",
        prixPromo: 15,
        whatsappPublic: true,
      }),
    }),
    noParams
  );
  check("whatsappPublic=true sans whatsappContact -> 400 VALIDATION_ERROR", whatsappSansNumeroRes.status === 400);

  // Troisième reset — ce bloc ajoute encore 2 soumissions authentifiées
  // (normalisation whatsapp + variante lienMaps), au-delà des 4 déjà faites
  // dans le bloc "soumission terrain" ci-dessus (limite 5/heure).
  await query(`delete from rate_limits where cle like 'soumission:%'`);

  console.log("\nnormalisation whatsapp — tirets, points, format international espacé");
  const whatsappTiretsRes = await postDeal(
    authedRequest("http://localhost/api/v1/deals", token, {
      method: "POST",
      headers: { "x-turnstile-token": "test" },
      body: JSON.stringify({
        titre: "Deal whatsapp tirets",
        categorie: "Autre",
        type: "physique",
        prixPromo: 15,
        whatsappContact: "0612-345-678",
        whatsappPublic: true,
      }),
    }),
    noParams
  );
  const whatsappTiretsBody = (await whatsappTiretsRes.json()) as { whatsappContact?: string };
  check(
    "whatsapp avec tirets -> normalisé en +212612345678",
    whatsappTiretsBody.whatsappContact === "+212612345678"
  );

  const lienMapsGoogleComRes = await postDeal(
    authedRequest("http://localhost/api/v1/deals", token, {
      method: "POST",
      headers: { "x-turnstile-token": "test" },
      body: JSON.stringify({
        titre: "Deal lienMaps maps.google.com",
        categorie: "Autre",
        type: "physique",
        prixPromo: 15,
        lienMaps: "https://maps.google.com/maps?q=Test&ll=33.5,-7.6",
      }),
    }),
    noParams
  );
  check("lienMaps maps.google.com -> 201 (variante réelle de partage)", lienMapsGoogleComRes.status === 201);

  // Quatrième reset — le bloc "soumission avec photo" ci-dessous ajoute 3
  // soumissions authentifiées (1 valide + 2 rejetées), au-delà de celles
  // déjà comptabilisées dans les blocs précédents (limite 5/heure).
  await query(`delete from rate_limits where cle like 'soumission:%'`);

  console.log("\nsoumission avec photo — multipart/form-data (CONTRAT-V1 §4/§6)");

  const photoForm = new FormData();
  photoForm.append("titre", "Deal avec photo test intégration");
  photoForm.append("categorie", "Autre");
  photoForm.append("type", "physique");
  photoForm.append("prixPromo", "42");
  photoForm.append("image", new File([TINY_PNG_BUFFER], "photo.png", { type: "image/png" }));

  const photoRes = await postDeal(
    authedFormRequest("http://localhost/api/v1/deals", token, photoForm, { "x-turnstile-token": "test" }),
    noParams
  );
  const photoBody = (await photoRes.json()) as { publicId?: string; imageKey?: string; statut?: string };
  check("soumission avec photo valide -> 201", photoRes.status === 201);
  check("soumission avec photo valide -> statut en_attente", photoBody.statut === "en_attente");
  const photoPublicId = photoBody.publicId;
  if (!photoPublicId) throw new Error("publicId manquant après soumission avec photo.");
  check("soumission avec photo valide -> imageKey peuplé", photoBody.imageKey === `deals/${photoPublicId}.webp`);

  const photoProxyRes = await getImgProxy(new Request(`http://localhost/img/deals/${photoPublicId}`), {
    params: Promise.resolve({ publicId: photoPublicId }),
  });
  check("photo soumise servie par le proxy -> 200", photoProxyRes.status === 200);
  check(
    "photo soumise servie par le proxy -> content-type webp",
    photoProxyRes.headers.get("content-type") === "image/webp"
  );

  console.log("\nsoumission avec photo — cas d'erreur (rouge -> vert : aucun deal créé)");

  const TITRE_PHOTO_INVALIDE = "Deal photo invalide test intégration";
  const invalidPhotoForm = new FormData();
  invalidPhotoForm.append("titre", TITRE_PHOTO_INVALIDE);
  invalidPhotoForm.append("categorie", "Autre");
  invalidPhotoForm.append("type", "physique");
  invalidPhotoForm.append("prixPromo", "10");
  invalidPhotoForm.append(
    "image",
    new File([Buffer.from("pas une image, juste du texte.")], "malware.jpg", { type: "image/jpeg" })
  );
  const invalidPhotoRes = await postDeal(
    authedFormRequest("http://localhost/api/v1/deals", token, invalidPhotoForm, { "x-turnstile-token": "test" }),
    noParams
  );
  check("soumission photo magic bytes invalides -> 400 VALIDATION_ERROR", invalidPhotoRes.status === 400);
  const dealsPhotoInvalide = await query<{ id: string }>("select id from deals where titre = $1", [
    TITRE_PHOTO_INVALIDE,
  ]);
  check("photo invalide -> aucun deal créé", dealsPhotoInvalide.length === 0);

  const TITRE_PHOTO_TROP_GROSSE = "Deal photo trop grosse test intégration";
  const oversizedPhotoForm = new FormData();
  oversizedPhotoForm.append("titre", TITRE_PHOTO_TROP_GROSSE);
  oversizedPhotoForm.append("categorie", "Autre");
  oversizedPhotoForm.append("type", "physique");
  oversizedPhotoForm.append("prixPromo", "10");
  oversizedPhotoForm.append(
    "image",
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "trop-gros.png", { type: "image/png" })
  );
  const oversizedPhotoRes = await postDeal(
    authedFormRequest("http://localhost/api/v1/deals", token, oversizedPhotoForm, { "x-turnstile-token": "test" }),
    noParams
  );
  check("soumission photo > 5 Mo -> 400 VALIDATION_ERROR", oversizedPhotoRes.status === 400);
  const dealsPhotoTropGrosse = await query<{ id: string }>("select id from deals where titre = $1", [
    TITRE_PHOTO_TROP_GROSSE,
  ]);
  check("photo trop volumineuse -> aucun deal créé", dealsPhotoTropGrosse.length === 0);

  console.log("\nexposition whatsapp — absente en public si non consentie, présente si consentie");

  const dealPriveRes = await postDeal(
    authedRequest("http://localhost/api/v1/deals", token, {
      method: "POST",
      headers: { "x-turnstile-token": "test" },
      body: JSON.stringify({
        titre: "Deal whatsapp non public",
        categorie: "Autre",
        type: "physique",
        prixPromo: 15,
        whatsappContact: "+212612345678",
        whatsappPublic: false,
      }),
    }),
    noParams
  );
  const dealPriveBody = (await dealPriveRes.json()) as { publicId?: string };
  const dealPrivePublicId = dealPriveBody.publicId;
  if (!dealPrivePublicId) throw new Error("publicId du deal privé manquant après soumission.");

  // Publie les deux deals — statut en_attente n'est jamais visible sans auth
  // (GET /api/v1/deals/:publicId public exige publie|expire).
  await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "publie" }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${dealPrivePublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "publie" }),
    }),
    { params: Promise.resolve({ publicId: dealPrivePublicId }) }
  );

  const lectureConsentieRes = await getDeal(new Request(`http://localhost/api/v1/deals/${terrainPublicId}`), {
    params: Promise.resolve({ publicId: terrainPublicId }),
  });
  const lectureConsentieBody = (await lectureConsentieRes.json()) as { whatsappContact?: string };
  check(
    "lecture publique -> whatsappContact présent quand whatsappPublic=true",
    lectureConsentieBody.whatsappContact === "+212612345678"
  );

  const lectureNonConsentieRes = await getDeal(new Request(`http://localhost/api/v1/deals/${dealPrivePublicId}`), {
    params: Promise.resolve({ publicId: dealPrivePublicId }),
  });
  const lectureNonConsentieBody = (await lectureNonConsentieRes.json()) as Record<string, unknown>;
  check(
    "lecture publique -> whatsappContact absent (pas null) quand whatsappPublic=false",
    !("whatsappContact" in lectureNonConsentieBody)
  );

  console.log("\nPATCH admin — motifRejet + édition curateur des champs terrain");
  const patchRejetRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${dealPrivePublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "rejete", motifRejet: "Photo manquante" }),
    }),
    { params: Promise.resolve({ publicId: dealPrivePublicId }) }
  );
  const patchRejetBody = (await patchRejetRes.json()) as { statut?: string; motifRejet?: string };
  check("PATCH admin motifRejet -> 200", patchRejetRes.status === 200);
  check("PATCH admin motifRejet -> statut rejete", patchRejetBody.statut === "rejete");
  check("PATCH admin motifRejet -> motifRejet conservé", patchRejetBody.motifRejet === "Photo manquante");

  const meAvecRejetRes = await getMe(authedRequest("http://localhost/api/v1/me", token), noParams);
  const meAvecRejetBody = (await meAvecRejetRes.json()) as {
    mesDeals?: { publicId?: string; motifRejet?: string | null }[];
  };
  const dealRejeteDansMe = (meAvecRejetBody.mesDeals ?? []).find((d) => d.publicId === dealPrivePublicId);
  check("GET /me -> motifRejet du deal rejeté visible", dealRejeteDansMe?.motifRejet === "Photo manquante");

  console.log(
    "\nPATCH admin — édition curateur complète (CONTRAT-V1 §3/§4, troisième amendement conscient du 19/07/2026)"
  );
  const editRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({
        statut: "publie",
        titre: "Hanout test intégration modifié",
        description: "Nouvelle description du test d'intégration",
        prixPromo: 20,
        prixNormal: 30,
        categorie: "Maison",
        dateFin: "2026-12-31",
        ville: "Rabat",
      }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  const editBody = (await editRes.json()) as {
    titre?: string;
    description?: string;
    prixPromo?: number;
    prixNormal?: number;
    categorie?: string;
    dateFin?: string;
    ville?: string;
  };
  check("édition complète -> 200", editRes.status === 200);
  check("édition complète -> titre modifié", editBody.titre === "Hanout test intégration modifié");
  check("édition complète -> description modifiée", editBody.description === "Nouvelle description du test d'intégration");
  check("édition complète -> prixPromo modifié", editBody.prixPromo === 20);
  check("édition complète -> prixNormal modifié", editBody.prixNormal === 30);
  check("édition complète -> categorie modifiée", editBody.categorie === "Maison");
  check("édition complète -> dateFin modifiée", editBody.dateFin === "2026-12-31");
  check("édition complète -> ville modifiée", editBody.ville === "Rabat");

  const auditRows = await query<{ details: unknown }>(
    "select details from journal_audit where cible_id = $1 and action = 'update_deal' order by created_at desc limit 1",
    [terrainPublicId]
  );
  check("journal_audit -> édition admin tracée (action update_deal)", auditRows.length > 0);

  console.log("\nédition complète — cohérence physique/en_ligne vérifiée sur l'état résultant (patch + existant)");
  const coherenceViolationRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "publie", type: "en_ligne" }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  const coherenceViolationBody = (await coherenceViolationRes.json()) as { error?: { fields?: Record<string, string> } };
  check(
    "type en_ligne sans lien existant ni fourni -> 400 VALIDATION_ERROR",
    coherenceViolationRes.status === 400
  );
  check(
    "cohérence violée -> détail du champ fautif fourni (fields.lien)",
    typeof coherenceViolationBody.error?.fields?.lien === "string"
  );

  const typeAvecLienRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "publie", type: "en_ligne", lien: "https://exemple.ma/produit" }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  const typeAvecLienBody = (await typeAvecLienRes.json()) as { type?: string; lien?: string };
  check("type en_ligne avec lien fourni -> 200", typeAvecLienRes.status === 200);
  check("type en_ligne avec lien fourni -> type modifié", typeAvecLienBody.type === "en_ligne");
  check("type en_ligne avec lien fourni -> lien conservé", typeAvecLienBody.lien === "https://exemple.ma/produit");

  const prixIncoherentRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "publie", prixPromo: 100, prixNormal: 50 }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  const prixIncoherentBody = (await prixIncoherentRes.json()) as { error?: { fields?: Record<string, string> } };
  check("prixNormal < prixPromo -> 400 VALIDATION_ERROR", prixIncoherentRes.status === 400);
  check(
    "prix incohérent -> détail du champ fautif fourni (fields.prixNormal)",
    typeof prixIncoherentBody.error?.fields?.prixNormal === "string"
  );

  console.log("\nédition complète — enseigneSlug : résolution, déliaison explicite (null), slug inconnu");
  const enseigneSetRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "publie", enseigneSlug: ENSEIGNE_SLUG }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  const enseigneSetBody = (await enseigneSetRes.json()) as { enseigneSlug?: string; enseigneNom?: string };
  check("enseigneSlug résolu -> 200", enseigneSetRes.status === 200);
  check("enseigneSlug résolu -> enseigneNom peuplé", enseigneSetBody.enseigneNom === "Test Integration");

  const enseigneClearRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "publie", enseigneSlug: null }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  const enseigneClearBody = (await enseigneClearRes.json()) as Record<string, unknown>;
  check("enseigneSlug: null -> 200 (déliaison explicite)", enseigneClearRes.status === 200);
  check("enseigneSlug déliée -> enseigneSlug absent", !("enseigneSlug" in enseigneClearBody) || enseigneClearBody.enseigneSlug === undefined);

  const enseigneInconnueRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "publie", enseigneSlug: "slug-qui-nexiste-pas" }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  check("enseigneSlug inconnu -> 400 VALIDATION_ERROR", enseigneInconnueRes.status === 400);

  console.log("\nimage-depuis-lien — garde SSRF et cas d'erreur (CONTRAT-V1 §4, troisième amendement conscient)");
  const imgSansLienRes = await postImageDepuisLien(
    authedRequest(`http://localhost/api/v1/admin/deals/${DEAL_PUBLIC_ID}/image-depuis-lien`, token, {
      method: "POST",
    }),
    { params: Promise.resolve({ publicId: DEAL_PUBLIC_ID }) }
  );
  check("image-depuis-lien sur un deal sans lien -> 400", imgSansLienRes.status === 400);

  await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${DEAL_PUBLIC_ID}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "publie", lien: "http://127.0.0.1:9/produit" }),
    }),
    { params: Promise.resolve({ publicId: DEAL_PUBLIC_ID }) }
  );
  const imgSsrfRes = await postImageDepuisLien(
    authedRequest(`http://localhost/api/v1/admin/deals/${DEAL_PUBLIC_ID}/image-depuis-lien`, token, {
      method: "POST",
    }),
    { params: Promise.resolve({ publicId: DEAL_PUBLIC_ID }) }
  );
  const imgSsrfBody = (await imgSsrfRes.json()) as { error?: { message?: string } };
  check("image-depuis-lien vers une IP privée -> 400 (SSRF bloqué)", imgSsrfRes.status === 400);
  check("image-depuis-lien SSRF -> message d'erreur clair", typeof imgSsrfBody.error?.message === "string");

  const imgNotFoundRes = await postImageDepuisLien(
    authedRequest("http://localhost/api/v1/admin/deals/zzzzzzzzzz/image-depuis-lien", token, { method: "POST" }),
    { params: Promise.resolve({ publicId: "zzzzzzzzzz" }) }
  );
  check("image-depuis-lien deal inconnu -> 404", imgNotFoundRes.status === 404);

  console.log("\nupload manuel d'image — POST /api/v1/admin/deals/:publicId/image (fallback Jumia)");

  const uploadForm = new FormData();
  uploadForm.append("image", new File([TINY_PNG_BUFFER], "test.png", { type: "image/png" }));
  const uploadRes = await postDealImage(
    authedFormRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}/image`, token, uploadForm),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  const uploadBody = (await uploadRes.json()) as { imageKey?: string };
  check("upload image valide -> 200", uploadRes.status === 200);
  check("upload image valide -> imageKey peuplé", uploadBody.imageKey === `deals/${terrainPublicId}.webp`);

  const proxyRes = await getImgProxy(new Request(`http://localhost/img/deals/${terrainPublicId}`), {
    params: Promise.resolve({ publicId: terrainPublicId }),
  });
  check("image uploadée servie par le proxy -> 200", proxyRes.status === 200);
  check("image uploadée servie par le proxy -> content-type webp", proxyRes.headers.get("content-type") === "image/webp");

  console.log("\nupload manuel d'image — cas d'erreur (rouge -> vert : chaque cas rejeté distinctement)");

  const oversizedForm = new FormData();
  oversizedForm.append(
    "image",
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "trop-gros.png", { type: "image/png" })
  );
  const oversizedRes = await postDealImage(
    authedFormRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}/image`, token, oversizedForm),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  check("upload > 5 Mo -> 400 VALIDATION_ERROR", oversizedRes.status === 400);

  const invalidMimeForm = new FormData();
  invalidMimeForm.append(
    "image",
    new File([Buffer.from("MZ ceci n'est pas une image, juste du texte.")], "malware.jpg", { type: "image/jpeg" })
  );
  const invalidMimeRes = await postDealImage(
    authedFormRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}/image`, token, invalidMimeForm),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  check(
    "upload type non reconnu par magic bytes (malgré Content-Type: image/jpeg déclaré) -> 400",
    invalidMimeRes.status === 400
  );

  const missingFileForm = new FormData();
  const missingFileRes = await postDealImage(
    authedFormRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}/image`, token, missingFileForm),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  check("upload sans fichier -> 400 VALIDATION_ERROR", missingFileRes.status === 400);

  const uploadNotFoundRes = await postDealImage(
    authedFormRequest("http://localhost/api/v1/admin/deals/zzzzzzzzzz/image", token, new FormData()),
    { params: Promise.resolve({ publicId: "zzzzzzzzzz" }) }
  );
  check("upload deal inconnu -> 404", uploadNotFoundRes.status === 404);

  console.log("\nvote — recalcul de score synchrone");
  const context = { params: Promise.resolve({ publicId: DEAL_PUBLIC_ID }) };

  const voteChaud = await postVote(
    authedRequest(`http://localhost/api/v1/deals/${DEAL_PUBLIC_ID}/votes`, token, {
      method: "POST",
      body: JSON.stringify({ sens: "chaud" }),
    }),
    context
  );
  const voteChaudBody = (await voteChaud.json()) as { score?: number };
  check("vote chaud -> 200", voteChaud.status === 200);
  check("vote chaud -> score = 1", voteChaudBody.score === 1);

  const voteFroid = await postVote(
    authedRequest(`http://localhost/api/v1/deals/${DEAL_PUBLIC_ID}/votes`, token, {
      method: "POST",
      body: JSON.stringify({ sens: "froid" }),
    }),
    context
  );
  const voteFroidBody = (await voteFroid.json()) as { score?: number };
  check("upsert vote -> froid, score = -1", voteFroidBody.score === -1);

  const voteDelete = await deleteVote(authedRequest(`http://localhost/api/v1/deals/${DEAL_PUBLIC_ID}/votes`, token), context);
  const voteDeleteBody = (await voteDelete.json()) as { score?: number };
  check("delete vote -> score = 0", voteDeleteBody.score === 0);

  console.log("\ncommentaires — pseudo exposé en plus de auteurPublicId");
  const postCommentRes = await postComment(
    authedRequest(`http://localhost/api/v1/deals/${DEAL_PUBLIC_ID}/commentaires`, token, {
      method: "POST",
      body: JSON.stringify({ contenu: "Commentaire du test d'intégration" }),
    }),
    context
  );
  const postCommentBody = (await postCommentRes.json()) as { pseudo?: string; auteurPublicId?: string };
  check("POST commentaire -> 201", postCommentRes.status === 201);
  check("POST commentaire -> pseudo = IntegrationTest", postCommentBody.pseudo === "IntegrationTest");
  check("POST commentaire -> auteurPublicId toujours présent", typeof postCommentBody.auteurPublicId === "string");

  const listCommentsRes = await getComments(
    new Request(`http://localhost/api/v1/deals/${DEAL_PUBLIC_ID}/commentaires`),
    context
  );
  const listCommentsBody = (await listCommentsRes.json()) as { data?: { pseudo?: string }[] };
  check(
    "GET commentaires -> pseudo présent sur au moins une ligne",
    (listCommentsBody.data ?? []).some((c) => c.pseudo === "IntegrationTest")
  );

  console.log("\nespace membre — GET/PATCH /api/v1/me");
  const meRes = await getMe(authedRequest("http://localhost/api/v1/me", token), noParams);
  const meBody = (await meRes.json()) as {
    publicId?: string;
    pseudo?: string;
    email?: string;
    couleurAvatar?: string;
    dealsCount?: number;
    votesCount?: number;
    commentairesCount?: number;
  };
  check("GET /me -> 200", meRes.status === 200);
  check("GET /me -> pseudo = IntegrationTest", meBody.pseudo === "IntegrationTest");
  check("GET /me -> email présent", typeof meBody.email === "string" && meBody.email.length > 0);
  check("GET /me -> couleurAvatar présente", typeof meBody.couleurAvatar === "string");
  check(
    "GET /me -> compteurs numériques",
    typeof meBody.dealsCount === "number" &&
      typeof meBody.votesCount === "number" &&
      typeof meBody.commentairesCount === "number"
  );

  const meNoAuthRes = await getMe(new Request("http://localhost/api/v1/me"), noParams);
  check("GET /me sans token -> 401 UNAUTHENTICATED", meNoAuthRes.status === 401);

  const patchOkRes = await patchMe(
    authedRequest("http://localhost/api/v1/me", token, {
      method: "PATCH",
      body: JSON.stringify({ pseudo: "IntegrationTest", couleurAvatar: "bleu" }),
    }),
    noParams
  );
  const patchOkBody = (await patchOkRes.json()) as { couleurAvatar?: string };
  check("PATCH /me valide -> 200", patchOkRes.status === 200);
  check("PATCH /me valide -> couleurAvatar mise à jour", patchOkBody.couleurAvatar === "bleu");

  const patchDupRes = await patchMe(
    authedRequest("http://localhost/api/v1/me", token, {
      method: "PATCH",
      body: JSON.stringify({ pseudo: AUTRE_PSEUDO }),
    }),
    noParams
  );
  check("PATCH /me pseudo déjà pris -> 400 VALIDATION_ERROR", patchDupRes.status === 400);

  const patchBadColorRes = await patchMe(
    authedRequest("http://localhost/api/v1/me", token, {
      method: "PATCH",
      body: JSON.stringify({ couleurAvatar: "fuchsia" }),
    }),
    noParams
  );
  check("PATCH /me couleur hors enum -> 400 VALIDATION_ERROR", patchBadColorRes.status === 400);

  console.log(
    "\n(DELETE /api/v1/me non testé automatiquement — suppression réelle du compte de test, à valider manuellement.)"
  );

  console.log(`\n${pass} passés, ${fail} échoués`);
  await closePool();
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
