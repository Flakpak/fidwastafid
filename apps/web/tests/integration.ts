import { withTransaction, closePool, query, getPool, type PoolClient } from "@fidwastafid/db";
import { generatePublicId } from "@fidwastafid/schemas";
import { purgerImages, DELAI_JOURS_PURGE_IMAGES, UTILISATEUR_SYSTEME_ID } from "../../pipeline/purger-images.mjs";
import { purgerLignes, DELAI_JOURS_PURGE_LIGNES } from "../../pipeline/purger-lignes.mjs";
import { expirerPublies } from "../../pipeline/_lib/expirerPublies.mjs";
import { marquerReleves } from "../../pipeline/_lib/vuLe.mjs";
import { appliquerPublicationAuto, resumerParSource, VERSION_REGLES } from "../../pipeline/_lib/publicationAuto.mjs";
import { ecrireArchiveEtTrace } from "../../pipeline/_lib/traceScraper.mjs";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { enregistrerRun } from "../../pipeline/_lib/pipelineRuns.mjs";
import { GET as getSitemapIndex } from "../src/app/sitemap.xml/route.js";
import { GET as getSitemapHubs } from "../src/app/sitemap-hubs.xml/route.js";
import { GET as getSitemapDeals } from "../src/app/sitemap-deals.xml/route.js";
import { fetchDealsEdition, categoriesFiltre } from "../src/app/api/v1/_lib/hubs.js";
import { fetchCibleFusion } from "../src/app/api/v1/_lib/deals.js";
import { annuler, diffuser } from "../src/app/api/v1/_lib/diffusion.js";
import { PUBLIC_IDS_FIXTURES, PUBLIC_ID_INEXISTANT } from "./fixtures.js";
import { POST as postDeal, GET as getDealsList } from "../src/app/api/v1/deals/route.js";
import { GET as getCompte } from "../src/app/api/v1/deals/compte/route.js";
import { GET as getDeal } from "../src/app/api/v1/deals/[publicId]/route.js";
import { POST as postVote, DELETE as deleteVote } from "../src/app/api/v1/deals/[publicId]/votes/route.js";
import { GET as getMesVotes } from "../src/app/api/v1/deals/mes-votes/route.js";
import {
  POST as postComment,
  GET as getComments,
} from "../src/app/api/v1/deals/[publicId]/commentaires/route.js";
import { GET as getMe, PATCH as patchMe } from "../src/app/api/v1/me/route.js";
import { PATCH as patchAdminDeal, DELETE as deleteAdminDeal } from "../src/app/api/v1/admin/deals/[publicId]/route.js";
import { POST as postRestaurer } from "../src/app/api/v1/admin/deals/[publicId]/restaurer/route.js";
import { GET as getMemoireCuration } from "../src/app/api/v1/admin/memoire-curation/route.js";
import { POST as postLeverMemoire } from "../src/app/api/v1/admin/memoire-curation/[id]/lever/route.js";
import { GET as getAdminDeals } from "../src/app/api/v1/admin/deals/route.js";
import { GET as getAdminDealsCompte } from "../src/app/api/v1/admin/deals/compte/route.js";
import { POST as postBulk } from "../src/app/api/v1/admin/deals/bulk/route.js";
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

/**
 * Suffixe de diagnostic pour les assertions sur l'e-mail de /me.
 *
 * Avant le correctif du 24/07/2026 (docs/INCIDENTS.md), une indisponibilité de
 * l'API admin Supabase faisait planter TOUT le script sur un opaque « Email
 * introuvable via l'API admin Supabase. » — sans statut HTTP, sans savoir
 * combien de fois on avait réessayé, ni à quelle étape du scénario.
 *
 * Désormais /me se dégrade (200 + `emailIndisponible`), la suite du scénario
 * s'exécute, et l'échec dit : l'étape, le statut HTTP de la réponse /me, et où
 * lire le statut amont réel + le nombre de tentatives (lignes `[supabase-admin]`
 * du wrapper, juste au-dessus dans ce même log).
 *
 * On ne masque PAS l'échec pour autant : l'assertion reste rouge. Masquer un
 * flake est la version CI du fallback silencieux qu'on vient de supprimer.
 */
function diagnosticEmail(
  etape: string,
  statutHttp: number,
  body: { email?: string; emailIndisponible?: boolean }
): string {
  if (typeof body.email === "string" && body.email.length > 0) return "";
  if (body.emailIndisponible) {
    return (
      ` [ÉCHEC AMONT — étape « ${etape} » : /me a répondu ${statutHttp} avec emailIndisponible=true.` +
      ` L'API admin Supabase était indisponible ; statut amont réel + nombre de tentatives dans les lignes` +
      ` "[supabase-admin]" ci-dessus. Le profil a bien été rendu sans l'e-mail (dégradation voulue).]`
    );
  }
  return ` [ÉCHEC — étape « ${etape} » : /me a répondu ${statutHttp}, e-mail absent SANS emailIndisponible —` +
    ` ce n'est donc pas une panne amont, mais une régression du contrat /me.]`;
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

/** Fixtures du lot 7 — les quatre situations de localisation d'un deal.
 *  Catégorie isolée : les vérifications restent vraies quel que soit le
 *  contenu réel de la base. */
const CATEGORIE_LOCALISATION = "Gaming";
const DEAL_EN_LIGNE = PUBLIC_IDS_FIXTURES.dealEnLigne;
const DEAL_NATIONAL = PUBLIC_IDS_FIXTURES.dealNational;
const DEAL_CASA = PUBLIC_IDS_FIXTURES.dealCasablanca;
const DEAL_RABAT = PUBLIC_IDS_FIXTURES.dealRabat;
const DEALS_LOCALISATION: [string, string | null, string][] = [
  [DEAL_EN_LIGNE, null, "en_ligne"],
  [DEAL_NATIONAL, "National", "physique"],
  [DEAL_CASA, "Casablanca", "physique"],
  [DEAL_RABAT, "Rabat", "physique"],
];

const ENSEIGNE_SLUG = "test-integration";
const DEAL_PUBLIC_ID = PUBLIC_IDS_FIXTURES.dealPrincipal;

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
      `insert into users (id, public_id, pseudo) values ($1, $2, 'IntegrationTest')
       on conflict (id) do nothing`,
      [userId, PUBLIC_IDS_FIXTURES.utilisateurTest]
    );
    await client.query(
      `insert into users (id, public_id, pseudo) values ($1, $2, $3)
       on conflict (id) do nothing`,
      [AUTRE_USER_ID, PUBLIC_IDS_FIXTURES.utilisateurAutre, AUTRE_PSEUDO]
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

  // Quatre deals publiés couvrant les quatre situations de localisation
  // (lot 7) : en ligne sans ville, national, et deux villes distinctes. Ils
  // partagent une catégorie à part pour ne pas dépendre du contenu réel de
  // la base — les vérifications ci-dessous portent sur l'APPARTENANCE de ces
  // quatre-là, jamais sur des totaux absolus.
  for (const [publicId, ville, type] of DEALS_LOCALISATION) {
    await query(
      `insert into deals (public_id, titre, enseigne_id, ville, categorie, type, prix_promo, statut, submitter_id, score)
       values ($1, $2, $3, $4, $5, $6, 1, 'publie', $7, 0)
       on conflict (public_id) do update set ville = excluded.ville, type = excluded.type, statut = 'publie'`,
      [publicId, `Localisation ${publicId}`, enseigneId, ville, CATEGORIE_LOCALISATION, type, userId]
    );
  }
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

  // Motif obligatoire (CONTRAT-V1 §3) — la garantie est côté serveur, le
  // formulaire ne fait que la doubler. Fait générateur : premier rejet réel en
  // prod le 27/07/2026, motif resté NULL.
  console.log("\nPATCH admin — un rejet sans motif est refusé");
  const rejetSansMotifRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "rejete" }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  const rejetSansMotifBody = (await rejetSansMotifRes.json()) as { error?: { fields?: Record<string, string> } };
  check("rejet sans motif -> 400 VALIDATION_ERROR", rejetSansMotifRes.status === 400);
  check(
    "rejet sans motif -> champ fautif désigné (fields.motifRejet)",
    typeof rejetSansMotifBody.error?.fields?.motifRejet === "string"
  );

  const motifVideRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "rejete", motifRejet: "  " }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  check("rejet avec motif vide -> 400 (plancher min(3) du schéma)", motifVideRes.status === 400);

  // L'obligation porte sur l'état RÉSULTANT : un deal déjà rejeté ET déjà
  // motivé n'a pas à renvoyer son motif à chaque édition ultérieure.
  const rejetDejaMotiveRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${dealPrivePublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "rejete" }),
    }),
    { params: Promise.resolve({ publicId: dealPrivePublicId }) }
  );
  const rejetDejaMotiveBody = (await rejetDejaMotiveRes.json()) as { motifRejet?: string };
  check("deal déjà rejeté et motivé, PATCH sans motif -> 200", rejetDejaMotiveRes.status === 200);
  check("motif existant préservé", rejetDejaMotiveBody.motifRejet === "Photo manquante");

  console.log("\nbulk — un rejet groupé sans motif est refusé (l'endpoint n'est pas une porte de sortie)");
  const bulkSansMotifRes = await postBulk(
    authedRequest("http://localhost/api/v1/admin/deals/bulk", token, {
      method: "POST",
      body: JSON.stringify({ publicIds: [dealPrivePublicId], statut: "rejete" }),
    }),
    noParams
  );
  check("bulk rejete sans motif -> 400", bulkSansMotifRes.status === 400);

  const bulkAvecMotifRes = await postBulk(
    authedRequest("http://localhost/api/v1/admin/deals/bulk", token, {
      method: "POST",
      body: JSON.stringify({ publicIds: [dealPrivePublicId], statut: "rejete", motifRejet: "Doublon" }),
    }),
    noParams
  );
  const bulkAvecMotifBody = (await bulkAvecMotifRes.json()) as { updated?: string[] };
  check("bulk rejete avec motif -> 200", bulkAvecMotifRes.status === 200);
  check("bulk rejete avec motif -> deal traité", (bulkAvecMotifBody.updated ?? []).includes(dealPrivePublicId));
  const motifApresBulk = await query<{ motif_rejet: string | null }>(
    "select motif_rejet from deals where public_id = $1",
    [dealPrivePublicId]
  );
  check("bulk rejete -> motif écrit en base", motifApresBulk[0]?.motif_rejet === "Doublon");

  const bulkPublieRes = await postBulk(
    authedRequest("http://localhost/api/v1/admin/deals/bulk", token, {
      method: "POST",
      body: JSON.stringify({ publicIds: [dealPrivePublicId], statut: "publie" }),
    }),
    noParams
  );
  check("bulk publie sans motif -> 200 (l'obligation ne vaut que pour rejete)", bulkPublieRes.status === 200);

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

  // Diff fidèle : rejouer le MÊME corps ne doit produire aucun champ modifié.
  // Reproduction exacte de l'entrée #240 du 27/07/2026, mais sur de vrais types
  // pg — ce que le test unitaire de auditDiff.ts ne peut pas faire : les
  // colonnes numeric reviennent en chaîne ("20.00") et sont comparées aux
  // nombres du corps JSON (20).
  console.log("\njournal d'audit — un enregistrement sans changement ne consigne aucun champ");
  const corpsIdentique = JSON.stringify({
    statut: "publie",
    titre: "Hanout test intégration modifié",
    description: "Nouvelle description du test d'intégration",
    prixPromo: 20,
    prixNormal: 30,
    categorie: "Maison",
    dateFin: "2026-12-31",
    ville: "Rabat",
  });
  const rejeuRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: corpsIdentique,
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  check("rejeu à l'identique -> 200", rejeuRes.status === 200);
  const rejeuAudit = await query<{ details: { champs?: Record<string, unknown> } }>(
    "select details from journal_audit where cible_id = $1 and action = 'update_deal' order by created_at desc limit 1",
    [terrainPublicId]
  );
  const champsRejeu = rejeuAudit[0]?.details?.champs ?? {};
  check(
    "rejeu à l'identique -> aucun champ dans le journal (plus de diff fantôme)",
    Object.keys(champsRejeu).length === 0
  );

  // La correction ne doit pas rendre le journal muet, seulement exact.
  const changementReelRes = await patchAdminDeal(
    authedRequest(`http://localhost/api/v1/admin/deals/${terrainPublicId}`, token, {
      method: "PATCH",
      body: JSON.stringify({ statut: "publie", prixPromo: 18.5 }),
    }),
    { params: Promise.resolve({ publicId: terrainPublicId }) }
  );
  check("changement réel de prix -> 200", changementReelRes.status === 200);
  const auditChangement = await query<{ details: { champs?: Record<string, { avant?: unknown; apres?: unknown }> } }>(
    "select details from journal_audit where cible_id = $1 and action = 'update_deal' order by created_at desc limit 1",
    [terrainPublicId]
  );
  const champsChangement = auditChangement[0]?.details?.champs ?? {};
  check("changement réel -> prixPromo consigné", "prixPromo" in champsChangement);
  check('changement réel -> avant normalisé en nombre (20, pas "20.00")', champsChangement.prixPromo?.avant === 20);
  check("changement réel -> après consigné", champsChangement.prixPromo?.apres === 18.5);

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
    authedRequest(`http://localhost/api/v1/admin/deals/${PUBLIC_ID_INEXISTANT}/image-depuis-lien`, token, { method: "POST" }),
    { params: Promise.resolve({ publicId: PUBLIC_ID_INEXISTANT }) }
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
    authedFormRequest(`http://localhost/api/v1/admin/deals/${PUBLIC_ID_INEXISTANT}/image`, token, new FormData()),
    { params: Promise.resolve({ publicId: PUBLIC_ID_INEXISTANT }) }
  );
  check("upload deal inconnu -> 404", uploadNotFoundRes.status === 404);

  // Le cas "bon jeton -> 200" de POST /api/revalidate n'est PAS testable ici :
  // revalidatePath() exige le contexte interne de Next.js ("static generation
  // store"), absent quand le handler est appelé directement comme une
  // fonction (constaté empiriquement — Invariant levée). Ce fichier appelle
  // les handlers directement partout ailleurs (cf. commentaire en tête de
  // fichier), sans serveur réel — non applicable à cette route précise. Les
  // cas 401 (sans jeton / mauvais jeton) restent couverts offline dans
  // tests/unit.ts (n'atteignent jamais revalidatePath). Le cas 200 est
  // vérifié manuellement contre le serveur Docker réel (rapport de
  // vérification), pas simulé ici.

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

  // ---------------------------------------------------------------------
  // Retrait de vote — reclic sur la flèche déjà active (lot dédié,
  // CardVote.onClicVote/retirer()). L'API le supportait déjà (DELETE
  // ci-dessus, jamais appelé côté client jusqu'ici) : ce qui manquait était
  // le chemin client, pas l'endpoint. Ici : le cas "vote inexistant" ne doit
  // produire ni erreur visible ni ligne fantôme.
  // ---------------------------------------------------------------------
  console.log("\nretrait de vote — sur un vote déjà inexistant, aucune erreur, aucune ligne fantôme");

  const ligneAvant = await query<{ id: string }>(
    "select id from votes where deal_id = (select id from deals where public_id = $1) and user_id = $2",
    [DEAL_PUBLIC_ID, userId]
  );
  check("avant retrait redondant -> aucune ligne votes pour ce deal/utilisateur", ligneAvant.length === 0);

  const voteDeleteRedondant = await deleteVote(
    authedRequest(`http://localhost/api/v1/deals/${DEAL_PUBLIC_ID}/votes`, token),
    context
  );
  const voteDeleteRedondantBody = (await voteDeleteRedondant.json()) as { score?: number };
  check("retrait sur un vote inexistant -> 200, jamais une erreur visible", voteDeleteRedondant.status === 200);
  check("retrait redondant -> score reste 0, pas de décrément fantôme", voteDeleteRedondantBody.score === 0);

  const ligneApres = await query<{ id: string }>(
    "select id from votes where deal_id = (select id from deals where public_id = $1) and user_id = $2",
    [DEAL_PUBLIC_ID, userId]
  );
  check("retrait redondant -> toujours aucune ligne votes (pas de ligne fantôme créée)", ligneApres.length === 0);

  // ---------------------------------------------------------------------
  // État voté persistant (CONTRAT-V1 §4, seizième amendement conscient) —
  // GET /api/v1/deals/mes-votes. Couvre explicitement le vote RETIRÉ, pas
  // seulement émis : le deal ci-dessus vient d'être dévoté (ligne
  // précédente) — mes-votes doit déjà le refléter avant même un nouveau
  // vote.
  // ---------------------------------------------------------------------
  console.log("\nmes-votes — vote émis puis retiré, les deux reflétés");

  const mesVotesApresRetrait = await getMesVotes(
    authedRequest(`http://localhost/api/v1/deals/mes-votes?ids=${DEAL_PUBLIC_ID}`, token),
    {}
  );
  const mesVotesApresRetraitBody = (await mesVotesApresRetrait.json()) as { votes?: Record<string, string> };
  check("mes-votes après retrait -> 200", mesVotesApresRetrait.status === 200);
  check(
    "mes-votes après retrait -> deal ABSENT de la réponse (pas de vote)",
    !(DEAL_PUBLIC_ID in (mesVotesApresRetraitBody.votes ?? {}))
  );

  await postVote(
    authedRequest(`http://localhost/api/v1/deals/${DEAL_PUBLIC_ID}/votes`, token, {
      method: "POST",
      body: JSON.stringify({ sens: "chaud" }),
    }),
    context
  );

  const mesVotesApresVote = await getMesVotes(
    authedRequest(`http://localhost/api/v1/deals/mes-votes?ids=${DEAL_PUBLIC_ID},${PUBLIC_ID_INEXISTANT}`, token),
    {}
  );
  const mesVotesApresVoteBody = (await mesVotesApresVote.json()) as { votes?: Record<string, string> };
  check("mes-votes après vote -> deal présent avec sens=chaud", mesVotesApresVoteBody.votes?.[DEAL_PUBLIC_ID] === "chaud");
  check(
    "mes-votes -> un id inconnu demandé en plus n'apparaît simplement pas (pas d'erreur)",
    !(PUBLIC_ID_INEXISTANT in (mesVotesApresVoteBody.votes ?? {}))
  );

  await deleteVote(authedRequest(`http://localhost/api/v1/deals/${DEAL_PUBLIC_ID}/votes`, token), context);
  const mesVotesRetireDeNouveau = await getMesVotes(
    authedRequest(`http://localhost/api/v1/deals/mes-votes?ids=${DEAL_PUBLIC_ID}`, token),
    {}
  );
  const mesVotesRetireDeNouveauBody = (await mesVotesRetireDeNouveau.json()) as { votes?: Record<string, string> };
  check(
    "mes-votes -> retiré à nouveau, redevient absent (jamais un historique)",
    !(DEAL_PUBLIC_ID in (mesVotesRetireDeNouveauBody.votes ?? {}))
  );

  const mesVotesSansAuth = await getMesVotes(new Request(`http://localhost/api/v1/deals/mes-votes?ids=${DEAL_PUBLIC_ID}`), {});
  check("mes-votes sans authentification -> 401", mesVotesSansAuth.status === 401);

  const mesVotesSansIds = await getMesVotes(authedRequest("http://localhost/api/v1/deals/mes-votes", token), {});
  check("mes-votes sans paramètre ids -> 400 VALIDATION_ERROR", mesVotesSansIds.status === 400);

  const mesVotesIdInvalide = await getMesVotes(
    authedRequest("http://localhost/api/v1/deals/mes-votes?ids=pas-un-id-valide", token),
    {}
  );
  check("mes-votes avec un identifiant mal formé -> 400 VALIDATION_ERROR", mesVotesIdInvalide.status === 400);

  const tropDIds = Array.from({ length: 51 }, () => generatePublicId()).join(",");
  const mesVotesTropDIds = await getMesVotes(authedRequest(`http://localhost/api/v1/deals/mes-votes?ids=${tropDIds}`, token), {});
  check("mes-votes avec plus de 50 identifiants -> 400 VALIDATION_ERROR", mesVotesTropDIds.status === 400);

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
    emailIndisponible?: boolean;
    couleurAvatar?: string;
    dealsCount?: number;
    votesCount?: number;
    commentairesCount?: number;
  };
  check("GET /me -> 200", meRes.status === 200);
  check("GET /me -> pseudo = IntegrationTest", meBody.pseudo === "IntegrationTest");
  check(`GET /me -> email présent${diagnosticEmail("GET /me", meRes.status, meBody)}`,
    typeof meBody.email === "string" && meBody.email.length > 0);
  check("GET /me -> couleurAvatar présente", typeof meBody.couleurAvatar === "string");
  // Le contrat rend l'absence d'e-mail EXPLICITE : plus besoin de deviner
  // entre « pas d'e-mail » et « e-mail pas récupéré » (correctif 24/07/2026).
  check("GET /me -> emailIndisponible explicite (booléen toujours présent)", typeof meBody.emailIndisponible === "boolean");
  check(
    "GET /me -> profil utilisable même si l'e-mail manque (dégradation gracieuse, jamais un 500)",
    meRes.status === 200 && typeof meBody.pseudo === "string"
  );
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

  // -------------------------------------------------------------------------
  // Lot 7 — ville, deals en ligne et compteurs, mesurés sur la VRAIE base.
  //
  // Les tests hors ligne verrouillent le partage des prédicats entre la liste
  // et les compteurs. Ici on vérifie ce que ce partage est censé produire :
  // le compteur annoncé est le nombre de lignes réellement servies.
  // -------------------------------------------------------------------------
  console.log("\nlot 7 — ville + deals en ligne, et total de résultats");

  /** Épuise la pagination : le total annoncé se compare au nombre RÉEL de
   *  deals servis, pas à une première page. */
  async function listerTout(qs: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 50; page++) {
      const url = `http://localhost/api/v1/deals?${qs}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await getDealsList(new Request(url));
      if (res.status !== 200) throw new Error(`GET /deals ${qs} -> ${res.status}`);
      const body = (await res.json()) as { data: { publicId: string }[]; nextCursor: string | null };
      ids.push(...body.data.map((d) => d.publicId));
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    return ids;
  }

  async function total(qs: string): Promise<number> {
    const res = await getCompte(new Request(`http://localhost/api/v1/deals/compte?${qs}`));
    const body = (await res.json()) as { total: number };
    return body.total;
  }

  const qsRabat = `categorie=${CATEGORIE_LOCALISATION}&ville=Rabat`;
  const idsRabat = await listerTout(qsRabat);
  check("ville choisie -> les deals de cette ville", idsRabat.includes(DEAL_RABAT));
  check("ville choisie -> PLUS les deals nationaux", idsRabat.includes(DEAL_NATIONAL));
  check("ville choisie -> PLUS les deals en ligne", idsRabat.includes(DEAL_EN_LIGNE));
  check("ville choisie -> jamais ceux d'une AUTRE ville", !idsRabat.includes(DEAL_CASA));
  check("total == nombre de deals réellement renvoyés (ville)", (await total(qsRabat)) === idsRabat.length);

  const qsEnLigne = `categorie=${CATEGORIE_LOCALISATION}&type=en_ligne`;
  const idsEnLigne = await listerTout(qsEnLigne);
  check("« en ligne » -> le deal en ligne", idsEnLigne.includes(DEAL_EN_LIGNE));
  check("« en ligne » -> aucun deal de boutique", !idsEnLigne.includes(DEAL_CASA) && !idsEnLigne.includes(DEAL_NATIONAL));
  check("total == nombre réellement renvoyé (en ligne)", (await total(qsEnLigne)) === idsEnLigne.length);
  check(
    "« en ligne » rend la ville sans objet : même résultat avec ou sans ville",
    (await total(`${qsEnLigne}&ville=Casablanca`)) === idsEnLigne.length
  );

  const qsBoutique = `categorie=${CATEGORIE_LOCALISATION}&type=physique`;
  const idsBoutique = await listerTout(qsBoutique);
  check("« en boutique » -> jamais le deal en ligne", !idsBoutique.includes(DEAL_EN_LIGNE));
  check("total == nombre réellement renvoyé (en boutique)", (await total(qsBoutique)) === idsBoutique.length);

  // L'agrégation par dimension est supprimée avec les compteurs par option :
  // il n'y a plus qu'un total à vérifier. On l'éprouve donc sur PLUSIEURS
  // jeux de filtres plutôt que sur plusieurs dimensions d'un seul.
  let totauxJustes = true;
  for (const qs of [
    `categorie=${CATEGORIE_LOCALISATION}`,
    `categorie=${CATEGORIE_LOCALISATION}&ville=Casablanca`,
    `categorie=${CATEGORIE_LOCALISATION}&ville=National`,
    `categorie=${CATEGORIE_LOCALISATION}&type=physique&ville=Rabat`,
    `q=${encodeURIComponent("Localisation")}`,
  ]) {
    const annonce = await total(qs);
    const reels = await listerTout(qs);
    if (annonce !== reels.length) {
      totauxJustes = false;
      console.log(`      ${qs} : total ${annonce} != ${reels.length} deals servis`);
    }
  }
  check("le total annoncé == le nombre de deals réellement servis, sur cinq jeux de filtres", totauxJustes);

  // Un curseur d'un autre jeu de filtres ne peut pas être rejoué (étape 8).
  const premierePage = await getDealsList(new Request("http://localhost/api/v1/deals?ville=Rabat&limit=1"));
  const { nextCursor } = (await premierePage.json()) as { nextCursor: string | null };
  if (nextCursor) {
    const rejoue = await getDealsList(
      new Request(`http://localhost/api/v1/deals?ville=Casablanca&limit=1&cursor=${encodeURIComponent(nextCursor)}`)
    );
    check("curseur d'un autre jeu de filtres -> 400, jamais une page silencieusement fausse", rejoue.status === 400);
  } else {
    check("curseur d'un autre jeu de filtres -> 400 (non exercé : une seule page)", true);
  }

  // -------------------------------------------------------------------------
  // File admin — filtre serveur, compte exact, dernière ligne atteignable
  // (docs/INCIDENTS.md, 04/08/2026 : une soumission en_attente restait
  // invisible derrière un LIMIT global partagé par tous les statuts).
  //
  // `expire` est un statut qu'aucun autre test de ce fichier ne touche —
  // isolé exprès, pour que ce bloc ne dépende ni n'interfère avec le reste
  // de la suite. Auto-nettoyé en fin de bloc (DELETE), la base d'intégration
  // étant un projet persistant, pas un conteneur jetable.
  // -------------------------------------------------------------------------
  console.log("\nfile admin — filtre par statut, compte exact, dernière ligne atteignable");

  const PAGE_TEST_LIMIT = 30; // DEFAULT_LIMIT, admin/deals/route.ts
  const N_SYNTHETIQUES = PAGE_TEST_LIMIT + 5; // > une page, sans dépendre d'un ordre précis
  const idsSynthetiques = Array.from({ length: N_SYNTHETIQUES }, () => generatePublicId());

  async function compteAdmin(statut: string): Promise<number> {
    const res = await getAdminDealsCompte(authedRequest("http://localhost/api/v1/admin/deals/compte", token), noParams);
    const body = (await res.json()) as { comptes: Record<string, number> };
    if (res.status !== 200) throw new Error(`GET /admin/deals/compte -> ${res.status}`);
    return body.comptes[statut] ?? 0;
  }

  async function listerToutAdmin(statut: string): Promise<{ ids: string[]; pages: number }> {
    const ids: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    for (let page = 0; page < 50; page++) {
      const url = `http://localhost/api/v1/admin/deals?statut=${statut}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await getAdminDeals(authedRequest(url, token), noParams);
      if (res.status !== 200) throw new Error(`GET /admin/deals?statut=${statut} -> ${res.status}`);
      pages++;
      const body = (await res.json()) as { data: { publicId: string }[]; nextCursor: string | null };
      ids.push(...body.data.map((d) => d.publicId));
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    return { ids, pages };
  }

  try {
    for (const publicId of idsSynthetiques) {
      await query(
        `insert into deals (public_id, titre, categorie, type, prix_promo, statut, submitter_id, score)
         values ($1, 'Deal test pagination admin', 'Autre', 'physique', 1, 'expire', $2, 0)
         on conflict (public_id) do nothing`,
        [publicId, userId]
      );
    }

    const verite = await query<{ total: number }>("select count(*)::int as total from deals where statut = 'expire'");
    const compteAttendu = verite[0]?.total ?? -1;
    const compteApi = await compteAdmin("expire");
    check(
      "GET /admin/deals/compte — compte exact (identique à un count(*) direct), pas la taille d'une liste tronquée",
      compteApi === compteAttendu
    );

    const { ids: idsServis, pages } = await listerToutAdmin("expire");
    check("file admin — plus d'une page réellement parcourue", pages > 1);
    check(
      "file admin — toutes les lignes synthétiques sont atteignables par pagination, y compris la dernière insérée",
      idsSynthetiques.every((id) => idsServis.includes(id))
    );
    check("file admin — la pagination ne sert aucune ligne en double", new Set(idsServis).size === idsServis.length);
  } finally {
    await query("delete from deals where statut = 'expire' and public_id = any($1::text[])", [idsSynthetiques]);
  }

  // -------------------------------------------------------------------------
  // Suppression douce (lot 1, plan « suppression administrative des deals »).
  // Un deal supprimé n'apparaît dans AUCUNE lecture ; restauré, il revient à
  // l'identique — dans son statut D'ORIGINE, jamais un statut par défaut.
  // Deal synthétique dédié (statut publie, soumis par le compte de test, un
  // vote réel dessus) : isolé du reste de la suite, auto-nettoyé.
  // -------------------------------------------------------------------------
  console.log("\nsuppression douce — invisible partout, restauration à l'identique");

  const SUPPR_PUBLIC_ID = generatePublicId();
  const enseigneRow = await query<{ id: string }>("select id from enseignes where slug = $1", [ENSEIGNE_SLUG]);
  const enseigneIdSuppr = enseigneRow[0]?.id;
  if (!enseigneIdSuppr) throw new Error("Fixture enseigne introuvable pour le test de suppression douce.");

  try {
    const inserted = await query<{ id: string }>(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, submitter_id, score)
       values ($1, 'Deal test suppression douce', $2, 'Autre', 'physique', 20, 'publie', $3, 0)
       returning id`,
      [SUPPR_PUBLIC_ID, enseigneIdSuppr, userId]
    );
    const dealIdSuppr = inserted[0]?.id;
    if (!dealIdSuppr) throw new Error("Deal de test (suppression douce) non inséré.");

    const voteRes = await postVote(
      authedRequest(`http://localhost/api/v1/deals/${SUPPR_PUBLIC_ID}/votes`, token, {
        method: "POST",
        body: JSON.stringify({ sens: "chaud" }),
      }),
      { params: Promise.resolve({ publicId: SUPPR_PUBLIC_ID }) }
    );
    check("suppression douce — vote de départ posé -> 200/201", voteRes.status === 200 || voteRes.status === 201);

    // --- Avant suppression : visible partout ---
    const detailAvant = await getDeal(new Request(`http://localhost/api/v1/deals/${SUPPR_PUBLIC_ID}`), {
      params: Promise.resolve({ publicId: SUPPR_PUBLIC_ID }),
    });
    check("avant suppression -> fiche publique 200", detailAvant.status === 200);

    const meAvant = await getMe(authedRequest("http://localhost/api/v1/me", token), noParams);
    const meAvantBody = (await meAvant.json()) as { mesDeals?: { publicId?: string }[] };
    check(
      "avant suppression -> présent dans /me mesDeals",
      (meAvantBody.mesDeals ?? []).some((d) => d.publicId === SUPPR_PUBLIC_ID)
    );

    const adminAvant = await getAdminDeals(authedRequest("http://localhost/api/v1/admin/deals?statut=publie&limit=200", token), noParams);
    const adminAvantBody = (await adminAvant.json()) as { data: { publicId: string }[] };
    check(
      "avant suppression -> présent dans l'onglet admin publie",
      adminAvantBody.data.some((d) => d.publicId === SUPPR_PUBLIC_ID)
    );

    // --- Suppression ---
    const suppRes = await deleteAdminDeal(authedRequest(`http://localhost/api/v1/admin/deals/${SUPPR_PUBLIC_ID}`, token, { method: "DELETE" }), {
      params: Promise.resolve({ publicId: SUPPR_PUBLIC_ID }),
    });
    check("DELETE admin -> 200", suppRes.status === 200);

    const suppRejoueRes = await deleteAdminDeal(
      authedRequest(`http://localhost/api/v1/admin/deals/${SUPPR_PUBLIC_ID}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ publicId: SUPPR_PUBLIC_ID }) }
    );
    check("DELETE sur un deal déjà supprimé -> 409 CONFLICT", suppRejoueRes.status === 409);

    // --- Après suppression : invisible PARTOUT, sauf l'onglet dédié ---
    const detailApres = await getDeal(new Request(`http://localhost/api/v1/deals/${SUPPR_PUBLIC_ID}`), {
      params: Promise.resolve({ publicId: SUPPR_PUBLIC_ID }),
    });
    check("après suppression -> fiche publique 404", detailApres.status === 404);

    const meApres = await getMe(authedRequest("http://localhost/api/v1/me", token), noParams);
    const meApresBody = (await meApres.json()) as { mesDeals?: { publicId?: string }[] };
    check(
      "après suppression -> absent de /me mesDeals",
      !(meApresBody.mesDeals ?? []).some((d) => d.publicId === SUPPR_PUBLIC_ID)
    );

    const adminApres = await getAdminDeals(authedRequest("http://localhost/api/v1/admin/deals?statut=publie&limit=200", token), noParams);
    const adminApresBody = (await adminApres.json()) as { data: { publicId: string }[] };
    check(
      "après suppression -> absent de l'onglet admin publie",
      !adminApresBody.data.some((d) => d.publicId === SUPPR_PUBLIC_ID)
    );

    const compteApres = await getAdminDealsCompte(authedRequest("http://localhost/api/v1/admin/deals/compte", token), noParams);
    const compteApresBody = (await compteApres.json()) as { supprimes: number };
    check("après suppression -> compte « supprimes » >= 1", compteApresBody.supprimes >= 1);

    const trashRes = await getAdminDeals(authedRequest("http://localhost/api/v1/admin/deals?supprime=true&limit=200", token), noParams);
    const trashBody = (await trashRes.json()) as {
      data: { publicId: string; statut: string; supprimeLe: string | null }[];
    };
    const enCorbeille = trashBody.data.find((d) => d.publicId === SUPPR_PUBLIC_ID);
    check("après suppression -> présent dans l'onglet Supprimés", Boolean(enCorbeille));
    check("onglet Supprimés -> conserve le statut d'origine (publie)", enCorbeille?.statut === "publie");
    check("onglet Supprimés -> supprimeLe renseigné", typeof enCorbeille?.supprimeLe === "string");

    const auditSuppr = await query<{ action: string }>(
      "select action from journal_audit where cible_type = 'deal' and cible_id = $1 and action = 'supprimer_deal'",
      [SUPPR_PUBLIC_ID]
    );
    check("suppression tracée dans journal_audit", auditSuppr.length === 1);

    const votesApresSuppr = await query<{ total: string }>("select count(*)::int as total from votes where deal_id = $1", [
      dealIdSuppr,
    ]);
    check(
      "le vote réel survit à la suppression douce (CASCADE neutralisé)",
      Number(votesApresSuppr[0]?.total ?? 0) === 1
    );

    // --- Restauration : revient à l'identique ---
    const restRejoueRes = await postRestaurer(
      authedRequest(`http://localhost/api/v1/admin/deals/${SUPPR_PUBLIC_ID}/restaurer`, token, { method: "POST" }),
      { params: Promise.resolve({ publicId: "zzzzzzzzzz" }) }
    );
    check(
      "restauration d'un deal jamais supprimé -> 404 (public_id inexistant)",
      restRejoueRes.status === 404
    );

    const restRes = await postRestaurer(
      authedRequest(`http://localhost/api/v1/admin/deals/${SUPPR_PUBLIC_ID}/restaurer`, token, { method: "POST" }),
      { params: Promise.resolve({ publicId: SUPPR_PUBLIC_ID }) }
    );
    const restBody = (await restRes.json()) as { statut?: string; supprimeLe?: string | null };
    check("POST restaurer -> 200", restRes.status === 200);
    check("restauré -> statut d'ORIGINE (publie), pas un statut par défaut", restBody.statut === "publie");
    check("restauré -> supprimeLe redevenu null", restBody.supprimeLe === null || restBody.supprimeLe === undefined);

    const restRejoue2Res = await postRestaurer(
      authedRequest(`http://localhost/api/v1/admin/deals/${SUPPR_PUBLIC_ID}/restaurer`, token, { method: "POST" }),
      { params: Promise.resolve({ publicId: SUPPR_PUBLIC_ID }) }
    );
    check("restaurer un deal déjà restauré -> 409 CONFLICT", restRejoue2Res.status === 409);

    const detailRestaure = await getDeal(new Request(`http://localhost/api/v1/deals/${SUPPR_PUBLIC_ID}`), {
      params: Promise.resolve({ publicId: SUPPR_PUBLIC_ID }),
    });
    const detailRestaureBody = (await detailRestaure.json()) as { titre?: string; prixPromo?: number };
    check("restauré -> fiche publique 200 de nouveau", detailRestaure.status === 200);
    check(
      "restauré -> identique à l'original (titre, prix)",
      detailRestaureBody.titre === "Deal test suppression douce" && detailRestaureBody.prixPromo === 20
    );

    const meRestaure = await getMe(authedRequest("http://localhost/api/v1/me", token), noParams);
    const meRestaureBody = (await meRestaure.json()) as { mesDeals?: { publicId?: string }[] };
    check(
      "restauré -> de nouveau présent dans /me mesDeals",
      (meRestaureBody.mesDeals ?? []).some((d) => d.publicId === SUPPR_PUBLIC_ID)
    );

    const trashApresRestore = await getAdminDeals(
      authedRequest("http://localhost/api/v1/admin/deals?supprime=true&limit=200", token),
      noParams
    );
    const trashApresRestoreBody = (await trashApresRestore.json()) as { data: { publicId: string }[] };
    check(
      "restauré -> disparu de l'onglet Supprimés",
      !trashApresRestoreBody.data.some((d) => d.publicId === SUPPR_PUBLIC_ID)
    );

    const auditRest = await query<{ action: string }>(
      "select action from journal_audit where cible_type = 'deal' and cible_id = $1 and action = 'restaurer_deal'",
      [SUPPR_PUBLIC_ID]
    );
    check("restauration tracée dans journal_audit", auditRest.length === 1);
  } finally {
    await query("delete from votes where deal_id = (select id from deals where public_id = $1)", [SUPPR_PUBLIC_ID]);
    await query("delete from journal_audit where cible_type = 'deal' and cible_id = $1", [SUPPR_PUBLIC_ID]);
    await query("delete from deals where public_id = $1", [SUPPR_PUBLIC_ID]);
  }

  // -------------------------------------------------------------------------
  // Mémoire de curation (lot 2) — corrige un bug actif : l'ancien
  // dédoublonnage du pipeline (titre+enseigne+prix_promo) laissait revenir
  // un deal rejeté dès que le prix changeait. L'empreinte ne regarde jamais
  // le prix ; le pipeline la consulte avant d'insérer ; une décision se
  // lève, elle ne se supprime jamais.
  // -------------------------------------------------------------------------
  console.log("\nmémoire de curation — empreinte sans prix, blocage pipeline, levée d'une décision");

  const MEM_PUBLIC_ID = generatePublicId();
  const MEM_LIEN = `https://exemple-test.invalid/produit/${MEM_PUBLIC_ID}`;

  try {
    const inserted = await query<{ id: string }>(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, lien, statut, score)
       values ($1, 'Deal test mémoire curation', $2, 'Autre', 'en_ligne', 50, $3, 'auto_draft', 0)
       returning id`,
      [MEM_PUBLIC_ID, enseigneIdSuppr, MEM_LIEN]
    );
    if (!inserted[0]) throw new Error("Deal de test (mémoire curation) non inséré.");

    // --- Rejet -> écrit la mémoire ---
    const rejetRes = await patchAdminDeal(
      authedRequest(`http://localhost/api/v1/admin/deals/${MEM_PUBLIC_ID}`, token, {
        method: "PATCH",
        body: JSON.stringify({ statut: "rejete", motifRejet: "Test mémoire de curation" }),
      }),
      { params: Promise.resolve({ publicId: MEM_PUBLIC_ID }) }
    );
    check("rejet -> 200", rejetRes.status === 200);

    const empreinteAttendue = await query<{ empreinte: string }>(
      "select empreinte_curation($1, $2, $3) as empreinte",
      [MEM_LIEN, "Deal test mémoire curation", Number(enseigneIdSuppr)]
    );
    const empreinte = empreinteAttendue[0]?.empreinte;
    if (!empreinte) throw new Error("empreinte_curation n'a rien renvoyé.");

    const memRow = await query<{ id: string; empreinte: string; decision: string; levee_le: string | null }>(
      "select id, empreinte, decision, levee_le from memoire_curation where deal_origine_public_id = $1",
      [MEM_PUBLIC_ID]
    );
    check("rejet -> une entrée de mémoire écrite", memRow.length === 1);
    check("mémoire -> empreinte basée sur le lien (jamais le prix)", memRow[0]?.empreinte === empreinte);
    check("mémoire -> décision active (non levée)", memRow[0]?.levee_le === null);
    const memId = memRow[0]?.id;
    if (!memId) throw new Error("id de l'entrée de mémoire introuvable.");

    // --- Ré-éditer un deal déjà rejeté ne duplique PAS la mémoire ---
    await patchAdminDeal(
      authedRequest(`http://localhost/api/v1/admin/deals/${MEM_PUBLIC_ID}`, token, {
        method: "PATCH",
        body: JSON.stringify({ statut: "rejete", motifRejet: "Motif corrigé, même décision" }),
      }),
      { params: Promise.resolve({ publicId: MEM_PUBLIC_ID }) }
    );
    const memApresReedit = await query<{ id: string }>(
      "select id from memoire_curation where deal_origine_public_id = $1",
      [MEM_PUBLIC_ID]
    );
    check("réédition d'un deal déjà rejeté -> aucune entrée dupliquée", memApresReedit.length === 1);

    // --- Le pipeline bloquerait un re-scrape au MÊME lien, prix DIFFÉRENT ---
    const bloqueAutrePrix = await query<{ bloque: boolean }>(
      `select exists(
         select 1 from memoire_curation
         where empreinte = empreinte_curation($1, $2, $3)
           and decision = 'rejete' and levee_le is null
       ) as bloque`,
      [MEM_LIEN, "Deal test mémoire curation", Number(enseigneIdSuppr)]
    );
    check(
      "empreinte insensible au prix -> un re-scrape à prix différent resterait bloqué",
      bloqueAutrePrix[0]?.bloque === true
    );

    // --- Visible dans la liste admin des décisions actives ---
    const listeRes = await getMemoireCuration(authedRequest("http://localhost/api/v1/admin/memoire-curation", token), noParams);
    const listeBody = (await listeRes.json()) as { data: { id: string; dealOriginePublicId: string | null }[] };
    check(
      "GET /admin/memoire-curation -> présent parmi les décisions actives",
      listeBody.data.some((e) => e.dealOriginePublicId === MEM_PUBLIC_ID)
    );

    // --- Lever un id inconnu -> 404 ---
    const leverInconnuRes = await postLeverMemoire(
      authedRequest("http://localhost/api/v1/admin/memoire-curation/999999999/lever", token, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "999999999" }) }
    );
    check("lever un id inconnu -> 404", leverInconnuRes.status === 404);

    // --- Lever la décision : le deal rejeté a été légitimement republié ---
    const leverRes = await postLeverMemoire(
      authedRequest(`http://localhost/api/v1/admin/memoire-curation/${memId}/lever`, token, {
        method: "POST",
        body: JSON.stringify({ motif: "Republié légitimement par l'enseigne, prix à jour." }),
      }),
      { params: Promise.resolve({ id: memId }) }
    );
    check("lever -> 200", leverRes.status === 200);

    const leverRejoueRes = await postLeverMemoire(
      authedRequest(`http://localhost/api/v1/admin/memoire-curation/${memId}/lever`, token, {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: memId }) }
    );
    check("lever une décision déjà levée -> 409 CONFLICT", leverRejoueRes.status === 409);

    const bloqueApresLevee = await query<{ bloque: boolean }>(
      `select exists(
         select 1 from memoire_curation
         where empreinte = $1 and decision = 'rejete' and levee_le is null
       ) as bloque`,
      [empreinte]
    );
    check("après levée -> le pipeline ne serait plus bloqué (levee_le renseigné)", bloqueApresLevee[0]?.bloque === false);

    const listeApresLevee = await getMemoireCuration(
      authedRequest("http://localhost/api/v1/admin/memoire-curation", token),
      noParams
    );
    const listeApresLeveeBody = (await listeApresLevee.json()) as { data: { dealOriginePublicId: string | null }[] };
    check(
      "après levée -> disparu des décisions actives",
      !listeApresLeveeBody.data.some((e) => e.dealOriginePublicId === MEM_PUBLIC_ID)
    );

    // --- empreinte_curation() : lien prioritaire, jamais le prix ---
    const empreintesLien = await query<{ e1: string; e2: string }>(
      `select empreinte_curation('https://x.test/p', 'Titre A', 1) as e1,
              empreinte_curation('https://x.test/p', 'Titre B', 2) as e2`
    );
    check(
      "empreinte_curation -> même lien = même empreinte, même si titre/enseigne diffèrent",
      empreintesLien[0]?.e1 === empreintesLien[0]?.e2
    );
    const empreintesReplis = await query<{ e1: string; e2: string }>(
      `select empreinte_curation(null, 'Même Titre', 7) as e1,
              empreinte_curation(null, '  même titre  ', 7) as e2`
    );
    check(
      "empreinte_curation -> repli titre+enseigne insensible à la casse/aux espaces",
      empreintesReplis[0]?.e1 === empreintesReplis[0]?.e2
    );
  } finally {
    await query("delete from memoire_curation where deal_origine_public_id = $1", [MEM_PUBLIC_ID]);
    await query("delete from journal_audit where cible_type = 'deal' and cible_id = $1", [MEM_PUBLIC_ID]);
    await query("delete from deals where public_id = $1", [MEM_PUBLIC_ID]);
  }

  // -------------------------------------------------------------------------
  // Critère de protection contre la purge (lot 3) — lecture seule côté
  // production, mais éprouvé ici en écriture sur des deals synthétiques :
  // protégé si trace de publication (ou diffusion) au journal d'audit ;
  // repli protecteur sur toute action d'un type non reconnu (doute).
  // -------------------------------------------------------------------------
  console.log("\ncritère de protection — trace de publication, résistance au contournement, repli protecteur");

  const PROT_JAMAIS_PUBLIE = generatePublicId();
  const PROT_PUBLIE_PUIS_AUTO_DRAFT = generatePublicId();
  const PROT_REJETE_SEUL = generatePublicId();
  const PROT_ACTION_INCONNUE = generatePublicId();

  try {
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score)
       values ($1, 'Protection — jamais publié', $2, 'Autre', 'physique', 10, 'auto_draft', 0)`,
      [PROT_JAMAIS_PUBLIE, enseigneIdSuppr]
    );

    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score)
       values ($1, 'Protection — publié puis rétrogradé', $2, 'Autre', 'physique', 10, 'auto_draft', 0)`,
      [PROT_PUBLIE_PUIS_AUTO_DRAFT, enseigneIdSuppr]
    );
    // Publie, PUIS rétrograde en auto_draft — tentative de contournement :
    // si le critère regardait le statut COURANT plutôt que l'historique,
    // ce deal redeviendrait purgeable après le second PATCH.
    await patchAdminDeal(
      authedRequest(`http://localhost/api/v1/admin/deals/${PROT_PUBLIE_PUIS_AUTO_DRAFT}`, token, {
        method: "PATCH",
        body: JSON.stringify({ statut: "publie" }),
      }),
      { params: Promise.resolve({ publicId: PROT_PUBLIE_PUIS_AUTO_DRAFT }) }
    );
    await patchAdminDeal(
      authedRequest(`http://localhost/api/v1/admin/deals/${PROT_PUBLIE_PUIS_AUTO_DRAFT}`, token, {
        method: "PATCH",
        body: JSON.stringify({ statut: "auto_draft" }),
      }),
      { params: Promise.resolve({ publicId: PROT_PUBLIE_PUIS_AUTO_DRAFT }) }
    );

    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score)
       values ($1, 'Protection — rejeté seulement', $2, 'Autre', 'physique', 10, 'en_attente', 0)`,
      [PROT_REJETE_SEUL, enseigneIdSuppr]
    );
    await patchAdminDeal(
      authedRequest(`http://localhost/api/v1/admin/deals/${PROT_REJETE_SEUL}`, token, {
        method: "PATCH",
        body: JSON.stringify({ statut: "rejete", motifRejet: "Test critère de protection" }),
      }),
      { params: Promise.resolve({ publicId: PROT_REJETE_SEUL }) }
    );

    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score)
       values ($1, 'Protection — action future inconnue', $2, 'Autre', 'physique', 10, 'auto_draft', 0)`,
      [PROT_ACTION_INCONNUE, enseigneIdSuppr]
    );
    // Simule une action journal_audit d'un type que cette classification
    // ne connaît pas encore (ex. une fonctionnalité future non anticipée
    // par la vue deals_protection) — le repli protecteur doit s'appliquer.
    await query(
      `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
       values ($1, 'action_future_inconnue', 'deal', $2, '{}')`,
      [userId, PROT_ACTION_INCONNUE]
    );

    const classification = await query<{ public_id: string; protege: boolean; statut: string }>(
      `select public_id, protege, statut from deals_protection
       where public_id = any($1::text[])`,
      [[PROT_JAMAIS_PUBLIE, PROT_PUBLIE_PUIS_AUTO_DRAFT, PROT_REJETE_SEUL, PROT_ACTION_INCONNUE]]
    );
    const par_id = Object.fromEntries(classification.map((r) => [r.public_id, r]));

    check("jamais publié -> PURGEABLE (protege = false)", par_id[PROT_JAMAIS_PUBLIE]?.protege === false);
    check(
      "publié puis rétrogradé en auto_draft -> reste PROTÉGÉ (contournement résisté)",
      par_id[PROT_PUBLIE_PUIS_AUTO_DRAFT]?.protege === true
    );
    check(
      "rétrogradé -> statut COURANT bien auto_draft (le critère ignore le statut, pas l'historique)",
      par_id[PROT_PUBLIE_PUIS_AUTO_DRAFT]?.statut === "auto_draft"
    );
    check("rejeté seulement, jamais publié -> PURGEABLE", par_id[PROT_REJETE_SEUL]?.protege === false);
    check(
      "action journal_audit d'un type inconnu -> repli protecteur, PROTÉGÉ",
      par_id[PROT_ACTION_INCONNUE]?.protege === true
    );
  } finally {
    const ids = [PROT_JAMAIS_PUBLIE, PROT_PUBLIE_PUIS_AUTO_DRAFT, PROT_REJETE_SEUL, PROT_ACTION_INCONNUE];
    await query("delete from journal_audit where cible_type = 'deal' and cible_id = any($1::text[])", [ids]);
    await query("delete from deals where public_id = any($1::text[])", [ids]);
  }

  // -------------------------------------------------------------------------
  // Purge d'images (lot 4) — apps/pipeline/purger-images.mjs appelé
  // directement (même client pg que le reste de ce fichier), en mode à blanc
  // uniquement : aucun test automatisé n'efface de fichier réel sur le
  // Storage (`actif: true` déclenche un vrai DELETE Storage, cf. en-tête du
  // script — jamais exercé ici). Ce qui est éprouvé : la sélection des
  // candidats (double condition + délai) et le comportement d'une ligne
  // purgée puis restaurée côté lecture (toDeal()/toDealAdmin()/lookup.ts).
  // -------------------------------------------------------------------------
  console.log("\npurge d'images — double condition, délai, comportement après restauration");

  const PURGE_VIEUX_PURGEABLE = generatePublicId();
  const PURGE_VIEUX_PROTEGE = generatePublicId();
  const PURGE_RECENT = generatePublicId();
  const PURGE_RESTAURE = generatePublicId();

  try {
    // Vieux (>90j), jamais publié, image présente -> CANDIDAT.
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, image_key, supprime_le)
       values ($1, 'Purge — vieux, purgeable', $2, 'Autre', 'physique', 10, 'expire', 0, 'deals/fixture-purge-1.webp', now() - interval '100 days')`,
      [PURGE_VIEUX_PURGEABLE, enseigneIdSuppr]
    );

    // Vieux (>90j) mais déjà publié un jour (protégé, lot 3) -> jamais candidat,
    // même supprimé depuis longtemps et avec une image.
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, image_key, supprime_le)
       values ($1, 'Purge — vieux mais protégé', $2, 'Autre', 'physique', 10, 'expire', 0, 'deals/fixture-purge-2.webp', now() - interval '100 days')`,
      [PURGE_VIEUX_PROTEGE, enseigneIdSuppr]
    );
    await query(
      `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
       values ($1, 'update_statut', 'deal', $2, '{"apres":"publie"}')`,
      [userId, PURGE_VIEUX_PROTEGE]
    );

    // Supprimé récemment (10j) -> pas encore assez vieux pour 90j, mais le
    // serait pour un délai simulé à 0j ("qu'est-ce qui serait purgé aujourd'hui").
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, image_key, supprime_le)
       values ($1, 'Purge — récent', $2, 'Autre', 'physique', 10, 'expire', 0, 'deals/fixture-purge-3.webp', now() - interval '10 days')`,
      [PURGE_RECENT, enseigneIdSuppr]
    );

    const pool = getPool();

    const auDelaiDefaut = await purgerImages({ client: pool, delaiJours: DELAI_JOURS_PURGE_IMAGES, actif: false });
    const idsDefaut = auDelaiDefaut.traites.map((t) => t.publicId);
    check("délai 90j -> le vieux purgeable est candidat", idsDefaut.includes(PURGE_VIEUX_PURGEABLE));
    check("délai 90j -> le vieux mais protégé N'EST PAS candidat", !idsDefaut.includes(PURGE_VIEUX_PROTEGE));
    check("délai 90j -> le récent (10j) N'EST PAS candidat", !idsDefaut.includes(PURGE_RECENT));

    const auDelaiZero = await purgerImages({ client: pool, delaiJours: 0, actif: false });
    const idsZero = auDelaiZero.traites.map((t) => t.publicId);
    check("délai 0j (simulation) -> le récent devient candidat", idsZero.includes(PURGE_RECENT));
    check("délai 0j (simulation) -> le protégé reste exclu même à délai nul", !idsZero.includes(PURGE_VIEUX_PROTEGE));

    // Mode à blanc : aucune écriture, ni sur les lignes candidates ni au journal.
    const apresSimulation = await query<{ image_purgee_le: string | null }>(
      "select image_purgee_le from deals where public_id = $1",
      [PURGE_VIEUX_PURGEABLE]
    );
    check("mode à blanc -> image_purgee_le reste null après simulation", apresSimulation[0]?.image_purgee_le === null);
    const journalApresSimulation = await query(
      "select 1 from journal_audit where action = 'purger_images' and admin_id = $1",
      [UTILISATEUR_SYSTEME_ID]
    );
    check("mode à blanc -> aucune ligne journal_audit écrite", journalApresSimulation.length === 0);

    // --- Comportement d'une ligne purgée puis restaurée (question posée à
    // la conception du lot) : image_purgee_le n'est JAMAIS effacé par une
    // restauration (seul supprime_le l'est) -> la fiche revient SANS image,
    // jamais avec un lien mort. Purge simulée directement en base (pas de
    // vrai DELETE Storage dans ce test) : c'est exactement l'état dans
    // lequel purgerImages({actif:true}) laisserait la ligne.
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, image_key, supprime_le, image_purgee_le)
       values ($1, 'Purge — restauré après purge', $2, 'Autre', 'physique', 10, 'expire', 0, 'deals/fixture-purge-4.webp', now() - interval '100 days', now())`,
      [PURGE_RESTAURE, enseigneIdSuppr]
    );

    const restauration = await postRestaurer(
      authedRequest(`http://localhost/api/v1/admin/deals/${PURGE_RESTAURE}/restaurer`, token, { method: "POST" }),
      { params: Promise.resolve({ publicId: PURGE_RESTAURE }) }
    );
    check("restauration d'une ligne purgée -> 200", restauration.status === 200);

    // `expire` est un statut public (CONTRAT-V1 §1, URL vivante à vie) : la
    // fiche reste servie normalement, seule l'image doit avoir disparu.
    const ficheApresRestauration = await getDeal(new Request(`http://localhost/api/v1/deals/${PURGE_RESTAURE}`), {
      params: Promise.resolve({ publicId: PURGE_RESTAURE }),
    });
    const ficheBody = (await ficheApresRestauration.json()) as { imageKey?: string };
    check("restauration -> la fiche publique reste servie (200, statut expire)", ficheApresRestauration.status === 200);
    check("restauration -> imageKey absent de la fiche publique (image purgée)", ficheBody.imageKey === undefined);

    const adminApresRestauration = await query<{ image_key: string | null; image_purgee_le: string | null; supprime_le: string | null }>(
      "select image_key, image_purgee_le, supprime_le from deals where public_id = $1",
      [PURGE_RESTAURE]
    );
    check("restauration -> supprime_le redevient null", adminApresRestauration[0]?.supprime_le === null);
    check(
      "restauration -> image_purgee_le N'EST PAS effacé (jamais annulé par une restauration)",
      adminApresRestauration[0]?.image_purgee_le !== null
    );
    check(
      "restauration -> image_key reste en base comme trace historique (non effacé)",
      adminApresRestauration[0]?.image_key === "deals/fixture-purge-4.webp"
    );

    const clePubliqueApresRestauration = await getImgProxy(new Request(`http://localhost/img/deals/${PURGE_RESTAURE}`), {
      params: Promise.resolve({ publicId: PURGE_RESTAURE }),
    });
    check(
      "restauration -> la route image publique ne sert plus le fichier purgé (404, pas l'ancien fichier)",
      clePubliqueApresRestauration.status === 404
    );
  } finally {
    const ids = [PURGE_VIEUX_PURGEABLE, PURGE_VIEUX_PROTEGE, PURGE_RECENT, PURGE_RESTAURE];
    await query("delete from journal_audit where cible_type = 'deal' and cible_id = any($1::text[])", [ids]);
    await query("delete from journal_audit where action = 'purger_images' and admin_id = $1", [
      UTILISATEUR_SYSTEME_ID,
    ]);
    await query("delete from deals where public_id = any($1::text[])", [ids]);
  }

  // -------------------------------------------------------------------------
  // Purge automatique des lignes (lot 5) — apps/pipeline/purger-lignes.mjs
  // appelé directement. En suppression DOUCE uniquement (jamais un DELETE) :
  // contrairement au lot 4, aucun risque d'irréversibilité ici, donc pas de
  // client-façade pour un « pire cas » — un vrai appel actif suffit.
  // -------------------------------------------------------------------------
  console.log("\npurge automatique des lignes — double condition, dormance, périmètre restreint (pas expire/en_attente)");

  const LIGNE_REJETE_VIEUX = generatePublicId();
  const LIGNE_REJETE_RECENT = generatePublicId();
  const LIGNE_REJETE_PROTEGE = generatePublicId();
  const LIGNE_EXPIRE_VIEUX = generatePublicId();
  const LIGNE_EN_ATTENTE_VIEUX = generatePublicId();

  try {
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, created_at)
       values ($1, 'Ligne — rejeté, vieux', $2, 'Autre', 'physique', 10, 'rejete', 0, now() - interval '100 days')`,
      [LIGNE_REJETE_VIEUX, enseigneIdSuppr]
    );
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, created_at)
       values ($1, 'Ligne — rejeté, récent', $2, 'Autre', 'physique', 10, 'rejete', 0, now() - interval '10 days')`,
      [LIGNE_REJETE_RECENT, enseigneIdSuppr]
    );
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, created_at)
       values ($1, 'Ligne — rejeté mais protégé', $2, 'Autre', 'physique', 10, 'rejete', 0, now() - interval '100 days')`,
      [LIGNE_REJETE_PROTEGE, enseigneIdSuppr]
    );
    await query(
      `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
       values ($1, 'update_statut', 'deal', $2, '{"apres":"publie"}')`,
      [userId, LIGNE_REJETE_PROTEGE]
    );
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, created_at)
       values ($1, 'Ligne — expire, vieux (hors périmètre)', $2, 'Autre', 'physique', 10, 'expire', 0, now() - interval '365 days')`,
      [LIGNE_EXPIRE_VIEUX, enseigneIdSuppr]
    );
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, created_at)
       values ($1, 'Ligne — en_attente, vieux (hors périmètre)', $2, 'Autre', 'physique', 10, 'en_attente', 0, now() - interval '365 days')`,
      [LIGNE_EN_ATTENTE_VIEUX, enseigneIdSuppr]
    );

    const pool = getPool();

    const auDelaiDefaut = await purgerLignes({ client: pool, delaiJours: DELAI_JOURS_PURGE_LIGNES, actif: false });
    const idsDefaut = auDelaiDefaut.traites.map((t) => t.publicId);
    check("délai 60j -> rejeté vieux est candidat", idsDefaut.includes(LIGNE_REJETE_VIEUX));
    check("délai 60j -> rejeté récent N'EST PAS candidat", !idsDefaut.includes(LIGNE_REJETE_RECENT));
    check("délai 60j -> rejeté mais protégé N'EST PAS candidat", !idsDefaut.includes(LIGNE_REJETE_PROTEGE));
    check("délai 60j -> expire JAMAIS candidat, même vieux et jamais publié (hors périmètre)", !idsDefaut.includes(LIGNE_EXPIRE_VIEUX));
    check(
      "délai 60j -> en_attente JAMAIS candidat, même vieux et jamais publié (hors périmètre)",
      !idsDefaut.includes(LIGNE_EN_ATTENTE_VIEUX)
    );

    const auDelaiZero = await purgerLignes({ client: pool, delaiJours: 0, actif: false });
    const idsZero = auDelaiZero.traites.map((t) => t.publicId);
    check("délai 0j (simulation) -> le rejeté récent devient candidat", idsZero.includes(LIGNE_REJETE_RECENT));
    check("délai 0j (simulation) -> expire reste exclu même à délai nul (périmètre, pas dormance)", !idsZero.includes(LIGNE_EXPIRE_VIEUX));

    // Mode à blanc : aucune écriture.
    const apresSimulation = await query<{ supprime_le: string | null }>("select supprime_le from deals where public_id = $1", [
      LIGNE_REJETE_VIEUX,
    ]);
    check("mode à blanc -> supprime_le reste null après simulation", apresSimulation[0]?.supprime_le === null);

    // --- Mode actif : suppression douce réelle + journal_audit réutilisant
    // l'action 'supprimer_deal' (déjà classée non-probante par deals_protection,
    // migration 0015) avec automatise:true — pas une action distincte.
    const resultatActif = await purgerLignes({ client: pool, delaiJours: DELAI_JOURS_PURGE_LIGNES, actif: true });
    check("mode actif -> le rejeté vieux traité", resultatActif.traites.some((t) => t.publicId === LIGNE_REJETE_VIEUX));

    const apresActif = await query<{ supprime_le: string | null }>("select supprime_le from deals where public_id = $1", [
      LIGNE_REJETE_VIEUX,
    ]);
    check("mode actif -> supprime_le posé pour de vrai", apresActif[0]?.supprime_le !== null);

    const journalActif = await query<{ action: string; admin_id: string; details: { automatise?: boolean } }>(
      "select action, admin_id, details from journal_audit where cible_type = 'deal' and cible_id = $1 order by created_at desc limit 1",
      [LIGNE_REJETE_VIEUX]
    );
    check("mode actif -> journal_audit réutilise l'action 'supprimer_deal'", journalActif[0]?.action === "supprimer_deal");
    check("mode actif -> journal_audit attribué à l'utilisateur système", journalActif[0]?.admin_id === UTILISATEUR_SYSTEME_ID);
    check("mode actif -> details.automatise = true (distingue du geste manuel)", journalActif[0]?.details?.automatise === true);

    // Symétrie avec le lot 1 : une ligne soft-supprimée automatiquement se
    // restaure exactement comme une ligne soft-supprimée à la main.
    const restaurationAuto = await postRestaurer(
      authedRequest(`http://localhost/api/v1/admin/deals/${LIGNE_REJETE_VIEUX}/restaurer`, token, { method: "POST" }),
      { params: Promise.resolve({ publicId: LIGNE_REJETE_VIEUX }) }
    );
    check("restauration d'une ligne auto-supprimée -> 200, même chemin que le geste manuel", restaurationAuto.status === 200);
  } finally {
    const ids = [LIGNE_REJETE_VIEUX, LIGNE_REJETE_RECENT, LIGNE_REJETE_PROTEGE, LIGNE_EXPIRE_VIEUX, LIGNE_EN_ATTENTE_VIEUX];
    await query("delete from journal_audit where cible_type = 'deal' and cible_id = any($1::text[])", [ids]);
    await query("delete from deals where public_id = any($1::text[])", [ids]);
  }

  // -------------------------------------------------------------------------
  // Recherche insensible aux accents (migration 0017, extension `unaccent`).
  // Deux fixtures délibérément construites CHACUNE dans un seul sens, pour
  // que le test ne puisse pas réussir par coïncidence : ACCENTUE porte les
  // accents dans le TITRE (requête sans accent doit quand même le trouver) ;
  // NON_ACCENTUE porte les accents dans la REQUÊTE (contenu sans accent doit
  // quand même être trouvé). Un seul mot testé dans un seul sens ne
  // prouverait que la moitié de la symétrie.
  // -------------------------------------------------------------------------
  console.log("\nrecherche sans accents — symétrie dans les deux sens, cas réels (café, crêpière)");

  const ACCENT_ACCENTUE = generatePublicId();
  const ACCENT_NON_ACCENTUE = generatePublicId();

  try {
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score)
       values ($1, 'Réfrigérateur Électroménager Premium', $2, 'Électroménager', 'physique', 10, 'publie', 0)`,
      [ACCENT_ACCENTUE, enseigneIdSuppr]
    );
    await query(
      `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score)
       values ($1, 'Crepiere electrique et machine a cafe', $2, 'Autre', 'physique', 10, 'publie', 0)`,
      [ACCENT_NON_ACCENTUE, enseigneIdSuppr]
    );

    async function chercher(q: string): Promise<string[]> {
      const res = await getDealsList(new Request(`http://localhost/api/v1/deals?q=${encodeURIComponent(q)}&limit=50`));
      const body = (await res.json()) as { data: { publicId: string }[] };
      return body.data.map((d) => d.publicId);
    }

    const avantElectromenager = await chercher("electromenager");
    check(
      "AVANT le sens attendu : « electromenager » (sans accent) trouve le titre accentué « Électroménager »",
      avantElectromenager.includes(ACCENT_ACCENTUE)
    );
    check(
      "sens inverse : « Électroménager » (avec accent) trouve aussi le même titre",
      (await chercher("Électroménager")).includes(ACCENT_ACCENTUE)
    );

    const parCafeAccentue = await chercher("café");
    check(
      "« café » (avec accent) trouve un titre écrit SANS accent (« cafe »)",
      parCafeAccentue.includes(ACCENT_NON_ACCENTUE)
    );
    check(
      "« crêpière » (avec accent) trouve un titre écrit SANS accent (« crepiere »)",
      (await chercher("crêpière")).includes(ACCENT_NON_ACCENTUE)
    );
    check(
      "« cafe »/« crepiere » (sans accent) trouvent aussi le même titre non accentué",
      (await chercher("cafe")).includes(ACCENT_NON_ACCENTUE) && (await chercher("crepiere")).includes(ACCENT_NON_ACCENTUE)
    );

    check(
      "un mot absent des deux titres ne matche ni l'un ni l'autre (pas devenu trop permissif)",
      !(await chercher("téléphonie")).includes(ACCENT_ACCENTUE) && !(await chercher("téléphonie")).includes(ACCENT_NON_ACCENTUE)
    );
  } finally {
    await query("delete from deals where public_id = any($1::text[])", [[ACCENT_ACCENTUE, ACCENT_NON_ACCENTUE]]);
  }

  // ----------------------------------------------------------------
  // Expiration des deals publiés (lot SEO-2b) — même requête que la prod
  // (`expirerPublies`, apps/pipeline/_lib/expirerPublies.mjs), instants
  // fixes, jour calculé par CE Postgres à Africa/Casablanca. Chaque cas
  // tourne dans sa propre transaction, annulée à la fin : la requête touche
  // TOUS les `publie` de la base, les fixtures des autres blocs ne doivent
  // pas en garder la trace.
  // ----------------------------------------------------------------
  // ----------------------------------------------------------------
  // Sitemap découpé + seuil d'indexation des catégories (lot SEO-3) — base
  // réelle. Catégorie « Voyages » : on la porte exactement à 8 deals actifs
  // (seuil), puis à 7, et on vérifie sa présence puis son absence dans
  // /sitemap-hubs.xml. Bascule automatique, sans aucune configuration.
  // ----------------------------------------------------------------
  console.log("\nsitemap découpé — index, hubs, seuil d'indexation des catégories");
  {
    const lireXml = async (handler: (r: Request) => Promise<Response>, chemin: string) =>
      (await handler(new Request(`http://localhost${chemin}`))).text();

    const index = await lireXml(getSitemapIndex, "/sitemap.xml");
    check("/sitemap.xml est un sitemapindex", index.includes("<sitemapindex"));
    check(
      "/sitemap.xml renvoie vers sitemap-hubs et sitemap-deals",
      index.includes("/sitemap-hubs.xml</loc>") && index.includes("/sitemap-deals.xml</loc>")
    );

    const deja = await query<{ n: number }>(
      `select count(*)::int as n from deals
        where categorie = 'Voyages' and statut = 'publie' and supprime_le is null
          and (date_fin is null or date_fin >= (now() at time zone 'Africa/Casablanca')::date)`
    );
    const aCreer = Math.max(0, 8 - (deja[0]?.n ?? 0));
    const idsVoyages = Array.from({ length: aCreer }, () => generatePublicId());
    try {
      for (const id of idsVoyages) {
        await query(
          `insert into deals (public_id, titre, categorie, type, prix_promo, prix_normal, statut, score)
           values ($1, 'Sitemap hubs — test seuil', 'Voyages', 'en_ligne', 50, 100, 'publie', 0)`,
          [id]
        );
      }
      const hubsA8 = await lireXml(getSitemapHubs, "/sitemap-hubs.xml");
      check("8 deals actifs → /categorie/voyages dans sitemap-hubs", hubsA8.includes("/categorie/voyages</loc>"));
      check("sitemap-hubs contient l'accueil", hubsA8.includes("<loc>https://") && hubsA8.includes("<priority>1</priority>"));
      check("sitemap-hubs contient /bons-plans/black-friday (édition configurée)", hubsA8.includes("/bons-plans/black-friday</loc>"));
      check("sitemap-hubs ne contient pas /bons-plans/ramadan (aucune édition → noindex)", !hubsA8.includes("/bons-plans/ramadan</loc>"));
      check("sitemap-hubs ne contient jamais /categorie/autre", !hubsA8.includes("/categorie/autre</loc>"));

      if (idsVoyages.length > 0) {
        await query("delete from deals where public_id = $1", [idsVoyages[0]]);
        const hubsA7 = await lireXml(getSitemapHubs, "/sitemap-hubs.xml");
        check("7 deals actifs → /categorie/voyages retirée de sitemap-hubs", !hubsA7.includes("/categorie/voyages</loc>"));
      }

      const deals = await lireXml(getSitemapDeals, "/sitemap-deals.xml");
      check("sitemap-deals est un urlset de fiches /deal/", deals.includes("<urlset") && deals.includes("/deal/"));
      check("sitemap-deals ne contient aucun hub", !deals.includes("/categorie/") && !deals.includes("/enseigne/"));
    } finally {
      await query("delete from deals where public_id = any($1::text[])", [idsVoyages]);
    }
  }

  // ----------------------------------------------------------------
  // Black Friday (lot SEO-2i) : deals publiés actifs REVUS à la source dans
  // les 48 dernières heures, remise ≥ 20 %.
  // ----------------------------------------------------------------
  console.log("\nBlack Friday — deals publiés revus sous 48 h");
  {
    const REVU = generatePublicId();
    const NON_REVU = generatePublicId();
    const SOUS_REMISE = generatePublicId();
    try {
      for (const [id, heures, prix] of [
        [REVU, 47, 50],
        [NON_REVU, 72, 50],
        [SOUS_REMISE, 1, 85],
      ] as const) {
        await query(
          `insert into deals (public_id, titre, categorie, type, prix_promo, prix_normal, statut, score, vu_le)
           values ($1, 'Black Friday — test revu', 'Maison', 'en_ligne', $2, 100, 'publie', 0,
                   now() - make_interval(hours => $3::int))`,
          [id, prix, heures]
        );
      }
      const ids = (await fetchDealsEdition(0.2, 1000)).map((d) => d.publicId);
      check("publié revu il y a 47 h → inclus", ids.includes(REVU));
      check("publié non revu depuis 3 jours → exclu", !ids.includes(NON_REVU));
      check("remise de 15 % → exclu", !ids.includes(SOUS_REMISE));
    } finally {
      await query("delete from deals where public_id = any($1::text[])", [[REVU, NON_REVU, SOUS_REMISE]]);
    }
  }

  // ----------------------------------------------------------------
  // Enseigne sous le seuil : hors sitemap-hubs à 7 deals actifs, présente à 8.
  // ----------------------------------------------------------------
  console.log("\nenseigne — seuil d'indexation (sitemap-hubs)");
  {
    const SLUG = "test-seuil-seo3";
    const ids = Array.from({ length: 8 }, () => generatePublicId());
    try {
      await query("insert into enseignes (slug, nom) values ($1, 'Test seuil SEO-3') on conflict (slug) do nothing", [SLUG]);
      for (const id of ids.slice(0, 7)) {
        await query(
          `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, prix_normal, statut, score)
           values ($1, 'Enseigne seuil — test', (select id from enseignes where slug = $2), 'Maison', 'en_ligne', 50, 100, 'publie', 0)`,
          [id, SLUG]
        );
      }
      const a7 = await (await getSitemapHubs(new Request("http://localhost/sitemap-hubs.xml"))).text();
      check("7 deals actifs → enseigne absente de sitemap-hubs", !a7.includes(`/enseigne/${SLUG}</loc>`));
      await query(
        `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, prix_normal, statut, score)
         values ($1, 'Enseigne seuil — test', (select id from enseignes where slug = $2), 'Maison', 'en_ligne', 50, 100, 'publie', 0)`,
        [ids[7], SLUG]
      );
      const a8 = await (await getSitemapHubs(new Request("http://localhost/sitemap-hubs.xml"))).text();
      check("8 deals actifs → enseigne présente dans sitemap-hubs", a8.includes(`/enseigne/${SLUG}</loc>`));
    } finally {
      await query("delete from deals where public_id = any($1::text[])", [ids]);
      await query("delete from enseignes where slug = $1", [SLUG]);
    }
  }

  // ----------------------------------------------------------------
  // Filtre de navigation (lot SEO-3b) : une catégorie n'est listée qu'avec
  // au moins 1 deal publié actif. « Gaming » à 0, puis à 1.
  // ----------------------------------------------------------------
  console.log("\nfiltre de navigation — catégories ayant au moins 1 deal actif");
  {
    const actifsGaming = await query<{ n: number }>(
      `select count(*)::int as n from deals
        where categorie = 'Gaming' and statut = 'publie' and supprime_le is null
          and (date_fin is null or date_fin >= (now() at time zone 'Africa/Casablanca')::date)`
    );
    if ((actifsGaming[0]?.n ?? 0) === 0) {
      const avant = await categoriesFiltre();
      check("Gaming à 0 deal actif → absente du filtre", !avant.some((c) => c.slug === "gaming"));
      check("« Autre » jamais dans le filtre (pas de page)", !avant.some((c) => c.categorie === "Autre"));
      const ID_GAMING = generatePublicId();
      try {
        await query(
          `insert into deals (public_id, titre, categorie, type, prix_promo, prix_normal, statut, score)
           values ($1, 'Filtre — test Gaming', 'Gaming', 'en_ligne', 50, 100, 'publie', 0)`,
          [ID_GAMING]
        );
        const apres = await categoriesFiltre();
        check("Gaming à 1 deal actif → présente, slug gaming", apres.some((c) => c.slug === "gaming"));
      } finally {
        await query("delete from deals where public_id = $1", [ID_GAMING]);
      }
    } else {
      check("(base avec des deals Gaming : cas 0 deal non testable ici)", true);
    }
  }

  // ----------------------------------------------------------------
  // Fraîcheur (lot SEO-2e) : même écriture que la prod (`marquerReleves`,
  // `enregistrerRun`), dans une transaction annulée à la fin.
  // ----------------------------------------------------------------
  console.log("\nfraîcheur — vu_le et trace de passage par source");
  {
    const client = await getPool().connect();
    try {
      await client.query("begin");
      const { rows: enseignesVu } = await client.query<{ id: string }>(
        "insert into enseignes (slug, nom) values ('test-vu-le', 'Test vu_le') returning id"
      );
      const enseigneVu = enseignesVu[0]!.id;
      const ancien = "2026-01-01T00:00:00Z";
      const inserer = async (titre: string, statut: string, supprimeLe: string | null, prix = 50) => {
        const id = generatePublicId();
        await client.query(
          `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, prix_normal, statut, score, vu_le, updated_at, supprime_le)
           values ($1, $2, $3, 'Maison', 'en_ligne', $4, 100, $5, 0, $6, $6, $7)`,
          [id, titre, enseigneVu, prix, statut, ancien, supprimeLe]
        );
        return id;
      };
      const lire = async (id: string) =>
        (
          await client.query<{ vu: boolean; maj: boolean; prix: string }>(
            `select vu_le > $2::timestamptz as vu, updated_at > $2::timestamptz as maj, prix_promo as prix
               from deals where public_id = $1`,
            [id, ancien]
          )
        ).rows[0]!;

      const PUBLIE = await inserer("Vu le — deal retrouvé", "publie", null);
      const EXPIRE = await inserer("Vu le — deal retrouvé", "expire", null);
      const SUPPRIME = await inserer("Vu le — deal retrouvé", "publie", "2026-02-01T00:00:00Z");
      const AUTRE_PRIX = await inserer("Vu le — deal retrouvé", "publie", null, 60);

      const ids = await marquerReleves(client, {
        // Lu deux fois dans le run (deux rayons) : une seule mise à jour.
        releves: [
          { titre: "VU LE — DEAL RETROUVÉ", prix: 50 },
          { titre: "vu le — deal retrouvé", prix: 50 },
        ],
        enseigneId: enseigneVu,
      });
      const publie = await lire(PUBLIE);
      check("deal retrouvé (casse différente) → vu_le mis à jour", publie.vu);
      check("deal retrouvé → updated_at inchangé", !publie.maj);
      check("deal retrouvé → prix inchangé", Number(publie.prix) === 50);
      check("une seule ligne marquée", ids.length === 1);
      check("deal expiré → vu_le inchangé", !(await lire(EXPIRE)).vu);
      check("deal supprimé → vu_le inchangé", !(await lire(SUPPRIME)).vu);
      check("même titre, autre prix → vu_le inchangé", !(await lire(AUTRE_PRIX)).vu);

      const insereSansVu = generatePublicId();
      await client.query(
        `insert into deals (public_id, titre, categorie, type, prix_promo, statut, score)
         values ($1, 'Vu le — défaut', 'Autre', 'en_ligne', 10, 'auto_draft', 0)`,
        [insereSansVu]
      );
      const { rows: defaut } = await client.query<{ ok: boolean }>(
        "select vu_le is not null as ok from deals where public_id = $1",
        [insereSansVu]
      );
      check("insertion → vu_le renseigné", defaut[0]?.ok === true);

      await enregistrerRun(client, {
        source: "test-trace",
        cause: "deja_en_base",
        extraits: 12,
        retenus: 3,
        inseres: 0,
        doublons: 3,
        elementsLus: 250,
        plafondAtteint: true,
        interrompu: false,
        vus: 3,
      });
      await enregistrerRun(client, { source: "test-trace-echec", cause: "injoignable", extraits: 0, retenus: 0, inseres: 0, doublons: 0 });
      const { rows: traces } = await client.query<{
        source: string;
        elements_lus: number | null;
        plafond_atteint: boolean | null;
        interrompu: boolean | null;
        vus: number | null;
      }>("select source, elements_lus, plafond_atteint, interrompu, vus from pipeline_runs where source like 'test-trace%'");
      const trace = traces.find((t) => t.source === "test-trace");
      check(
        "trace par source avec plafond atteint",
        trace?.elements_lus === 250 && trace.plafond_atteint === true && trace.interrompu === false && trace.vus === 3
      );
      const echec = traces.find((t) => t.source === "test-trace-echec");
      check("source injoignable → trace NULL (non mesuré, pas zéro)", echec?.elements_lus === null && echec.vus === null);
    } finally {
      await client.query("rollback");
      client.release();
    }
  }

  // ----------------------------------------------------------------
  // « Revu » = présent à la source (lot SEO-2e-bis), de bout en bout : le
  // VRAI insert-deals.mjs sur une archive et sa trace.
  // ----------------------------------------------------------------
  console.log("\nfraîcheur — revu avant les filtres (insert-deals.mjs réel)");
  {
    const SLUG_REVU = "test-revu-source";
    const dossier = mkdtempSync(nodePath.join(tmpdir(), "revu-source-"));
    const ancien = "2026-01-01T00:00:00Z";
    const ids = { sousSeuil: generatePublicId(), nonRemise: generatePublicId(), autrePrix: generatePublicId() };
    try {
      await query("insert into enseignes (slug, nom) values ($1, 'Test revu source')", [SLUG_REVU]);
      for (const [id, titre, prix] of [
        [ids.sousSeuil, "Revu source — sous le seuil", 95],
        [ids.nonRemise, "Revu source — plus remisé", 70],
        [ids.autrePrix, "Revu source — autre prix", 50],
      ] as const) {
        await query(
          `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, prix_normal, statut, score, vu_le, updated_at)
           values ($1, $2, (select id from enseignes where slug = $3), 'Maison', 'en_ligne', $4, 100, 'publie', 0, $5, $5)`,
          [id, titre, SLUG_REVU, prix, ancien]
        );
      }
      const archive = nodePath.join(dossier, "2026-11-23_05-00_test-revu-source.json");
      // L'archive ne porte que l'élément sous le seuil (5 % < 30 %) ; les deux
      // autres n'ont été que LUS (écartés par le scraper).
      ecrireArchiveEtTrace(
        archive,
        [
          {
            titre: "Revu source — sous le seuil",
            enseigne: SLUG_REVU,
            ville: "National",
            categorie: "Maison",
            type: "en_ligne",
            prix_promo: 95,
            prix_normal: 100,
            lien: "https://exemple.test/produit",
            statut: "auto_draft",
          },
        ],
        {
          lus: 3,
          plafondAtteint: false,
          interrompu: false,
          enseigne: SLUG_REVU,
          releves: [
            { titre: "REVU SOURCE — SOUS LE SEUIL", prix: 95 },
            { titre: "Revu source — plus remisé", prix: 70 },
            { titre: "Revu source — autre prix", prix: 60 },
          ],
        }
      );
      execFileSync(process.execPath, ["--import", "tsx", "insert-deals.mjs", archive], {
        cwd: nodePath.resolve(process.cwd(), "../pipeline"),
        env: process.env,
        stdio: "pipe",
      });

      const lire = async (id: string) =>
        (
          await query<{ vu: boolean; maj: boolean }>(
            `select vu_le > $2::timestamptz as vu, updated_at > $2::timestamptz as maj from deals where public_id = $1`,
            [id, ancien]
          )
        )[0];
      check("élément sous le seuil, deal publié → vu_le mis à jour", (await lire(ids.sousSeuil))?.vu === true);
      check("élément sous le seuil → updated_at inchangé", (await lire(ids.sousSeuil))?.maj === false);
      check("élément lu mais écarté par le scraper → vu_le mis à jour", (await lire(ids.nonRemise))?.vu === true);
      check("élément au prix différent → vu_le inchangé", (await lire(ids.autrePrix))?.vu === false);
      const lignes = await query<{ n: number }>(
        "select count(*)::int as n from deals where enseigne_id = (select id from enseignes where slug = $1)",
        [SLUG_REVU]
      );
      check("rien d'inséré", lignes[0]?.n === 3);
      const run = await query<{ elements_lus: number; vus: number; inseres: number }>(
        "select elements_lus, vus, inseres from pipeline_runs where source = 'test-revu-source' order by cree_le desc limit 1"
      );
      check(
        "trace : « revus » compte les correspondances",
        run[0]?.elements_lus === 3 && run[0]?.vus === 2 && run[0]?.inseres === 0
      );
    } finally {
      rmSync(dossier, { recursive: true, force: true });
      await query("delete from pipeline_runs where source = 'test-revu-source'");
      await query("delete from deals where public_id = any($1::text[])", [Object.values(ids)]);
      await query("delete from enseignes where slug = $1", [SLUG_REVU]);
    }
  }

  // ----------------------------------------------------------------
  // Publication automatique (lot SEO-2g) — même requête que la prod. Chaque
  // cas tourne dans sa transaction, annulée à la fin, après avoir écarté les
  // brouillons des autres blocs.
  // ----------------------------------------------------------------
  // ----------------------------------------------------------------
  // Réinsertion (lot SEO-2h), de bout en bout avec le VRAI insert-deals.mjs :
  // seul un rejet admin bloque le retour d'un produit.
  // ----------------------------------------------------------------
  console.log("\nréinsertion — seul un rejet admin bloque (insert-deals.mjs réel)");
  {
    const SLUG = "test-reinsertion";
    const dossier = mkdtempSync(nodePath.join(tmpdir(), "reinsertion-"));
    const ancien = "2026-01-01T00:00:00Z";
    const lien = (nom: string) => `https://exemple.test/reinsertion/${nom}`;
    const ids = {
      expireBrouillon: generatePublicId(),
      expirePublie: generatePublicId(),
      rejete: generatePublicId(),
      rejeteAutreLien: generatePublicId(),
      publie: generatePublicId(),
      brouillon: generatePublicId(),
    };
    const titres = {
      expireBrouillon: "Réinsertion — brouillon expiré",
      expirePublie: "Réinsertion — publié puis expiré",
      rejete: "Réinsertion — rejeté par l'admin",
      rejeteAutreLien: "Réinsertion — rejeté, lien changé",
      publie: "Réinsertion — publié actif",
      brouillon: "Réinsertion — brouillon actif",
    };
    const compter = async (titre: string) =>
      (
        await query<{ n: number }>(
          `select count(*)::int as n from deals
            where enseigne_id = (select id from enseignes where slug = $1) and titre = $2`,
          [SLUG, titre]
        )
      )[0]?.n;
    try {
      await query("insert into enseignes (slug, nom) values ($1, 'Test réinsertion')", [SLUG]);
      for (const [cle, statut] of [
        ["expireBrouillon", "expire"],
        ["expirePublie", "expire"],
        ["rejete", "rejete"],
        ["rejeteAutreLien", "rejete"],
        ["publie", "publie"],
        ["brouillon", "auto_draft"],
      ] as const) {
        await query(
          `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, prix_normal, lien, statut, score, vu_le, updated_at, motif_rejet)
           values ($1, $2, (select id from enseignes where slug = $3), 'Maison', 'en_ligne', 50, 100, $4, $5, 0, $6, $6,
                   case when $5 = 'rejete' then 'Test' end)`,
          [ids[cle], titres[cle], SLUG, lien(cle), statut, ancien]
        );
      }
      await query(
        `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
         values ($1, 'update_deal', 'deal', $2, '{"statut":{"avant":"auto_draft","apres":"publie"},"champs":{}}')`,
        [userId, ids.expirePublie]
      );
      for (const cle of ["rejete", "rejeteAutreLien"] as const) {
        await query(
          `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
           values ($1, 'update_deal', 'deal', $2, '{"statut":{"avant":"auto_draft","apres":"rejete"},"champs":{}}')`,
          [userId, ids[cle]]
        );
        await query(
          `insert into memoire_curation (empreinte, decision, deal_origine_public_id, motif, decide_par)
           values (empreinte_curation($1, $2, null), 'rejete', $3, 'Test', $4)`,
          [lien(cle), titres[cle], ids[cle], userId]
        );
      }

      const element = (cle: keyof typeof ids, lienElement = lien(cle)) => ({
        titre: titres[cle],
        prix_promo: 50,
        prix_normal: 100,
        categorie: "Maison",
        description: null,
        photo_url: null,
        lien: lienElement,
        date_fin: null,
        enseigne: SLUG,
        ville: "National",
        statut: "auto_draft",
      });
      const elements = [
        element("expireBrouillon"),
        element("expirePublie"),
        element("rejete"),
        element("rejeteAutreLien", lien("rejeteAutreLien-nouveau")),
        element("publie"),
        element("brouillon"),
      ];
      const archive = nodePath.join(dossier, "2026-11-23_05-00_test-reinsertion.json");
      ecrireArchiveEtTrace(archive, elements, {
        lus: elements.length,
        plafondAtteint: false,
        interrompu: false,
        enseigne: SLUG,
        releves: elements.map((e) => ({ titre: e.titre, prix: e.prix_promo })),
      });
      const sortie = execFileSync(process.execPath, ["--import", "tsx", "insert-deals.mjs", archive], {
        cwd: nodePath.resolve(process.cwd(), "../pipeline"),
        env: process.env,
        stdio: "pipe",
      }).toString();

      check("brouillon expiré → réactivé, aucune nouvelle ligne", (await compter(titres.expireBrouillon)) === 1);
      check("publié puis expiré → réactivé, aucune nouvelle ligne", (await compter(titres.expirePublie)) === 1);
      check("rejeté par l'admin → bloqué", (await compter(titres.rejete)) === 1);
      check("rejeté, revenu sous un autre lien → bloqué", (await compter(titres.rejeteAutreLien)) === 1);
      check("publié actif → non inséré", (await compter(titres.publie)) === 1);
      check("brouillon actif → non inséré", (await compter(titres.brouillon)) === 1);
      const vuPublie = await query<{ vu: boolean }>("select vu_le > $2::timestamptz as vu from deals where public_id = $1", [
        ids.publie,
        ancien,
      ]);
      check("publié actif → vu_le mis à jour", vuPublie[0]?.vu === true);
      const reactive = await query<{ statut: string }>("select statut from deals where public_id = $1", [ids.expirePublie]);
      check("le produit revient en brouillon sur sa ligne", reactive[0]?.statut === "auto_draft");
      const resume = JSON.parse(sortie.match(/^RESUME_JSON=(.*)$/m)?.[1] ?? "{}") as {
        inseres?: number;
        doublons?: number;
        bloquesRejetAdmin?: number;
        reactives?: number;
      };
      check(
        "résumé : 0 inséré, 2 réactivés, 2 doublons actifs, 2 bloqués par un rejet admin",
        resume.inseres === 0 && resume.reactives === 2 && resume.doublons === 2 && resume.bloquesRejetAdmin === 2
      );
    } finally {
      rmSync(dossier, { recursive: true, force: true });
      await query("delete from pipeline_runs where source = 'test-reinsertion'");
      await query("delete from journal_audit where cible_type = 'deal' and cible_id = any($1::text[])", [Object.values(ids)]);
      await query("delete from memoire_curation where deal_origine_public_id = any($1::text[])", [Object.values(ids)]);
      await query("delete from deals where enseigne_id = (select id from enseignes where slug = $1)", [SLUG]);
      await query("delete from enseignes where slug = $1", [SLUG]);
    }
  }

  // ----------------------------------------------------------------
  // Un produit, une fiche (lot SEO-2i), de bout en bout avec le VRAI
  // insert-deals.mjs. Fichier nommé `_kiabi` : source réelle du cron, pour
  // la publication automatique et le garde-fou de 25 %.
  // ----------------------------------------------------------------
  console.log("\nun produit, une fiche — réactivation, prix, image (insert-deals.mjs réel)");
  {
    const MARQUEUR_LUS = 7777;
    const dossier = mkdtempSync(nodePath.join(tmpdir(), "fiche-produit-"));
    const ancien = "2026-01-01T00:00:00Z";
    const creer: string[] = [];
    const lien = (nom: string) => `https://exemple.test/fiche/${nom}`;
    const photo = (nom: string) => `https://exemple.test/img/${nom}.jpg`;
    const inserer = async (
      slug: string,
      nom: string,
      statut: string,
      options: { submitter?: string; image?: string | null } = {}
    ) => {
      const id = generatePublicId();
      creer.push(id);
      await query("insert into enseignes (slug, nom) values ($1, $1) on conflict (slug) do nothing", [slug]);
      await query(
        `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, prix_normal, lien, statut, score,
                            vu_le, updated_at, image_key, submitter_id, motif_rejet)
         values ($1, $2, (select id from enseignes where slug = $3), 'Maison', 'en_ligne', 50, 100, $4, $5, 0,
                 $6, $6, $7, $8, case when $5 = 'rejete' then 'Test' end)`,
        [id, `Fiche produit ${nom}`, slug, lien(nom), statut, ancien,
         options.image === undefined ? `deals/${id}.webp` : options.image, options.submitter ?? null]
      );
      return id;
    };
    const auditer = (id: string, apres: string) =>
      query(
        `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
         values ($1, 'update_deal', 'deal', $2, $3)`,
        [userId, id, JSON.stringify({ statut: { avant: "auto_draft", apres }, champs: {} })]
      );
    const lire = async (id: string) =>
      (
        await query<{ statut: string; prix: string; normal: string; image: string | null; source: string | null; vu: boolean; protege: boolean }>(
          `select d.statut, d.prix_promo as prix, d.prix_normal as normal, d.image_key as image, d.image_source as source,
                  d.vu_le > $2::timestamptz as vu, p.protege
             from deals d join deals_protection p using (public_id) where d.public_id = $1`,
          [id, ancien]
        )
      )[0];
    const lignesDe = async (nom: string) =>
      (await query<{ n: number }>("select count(*)::int as n from deals where titre = $1", [`Fiche produit ${nom}`]))[0]?.n;
    const element = (slug: string, nom: string, prix: number, prixNormal: number | null = 100) => ({
      titre: `Fiche produit ${nom}`,
      prix_promo: prix,
      prix_normal: prixNormal,
      categorie: "Maison",
      description: null,
      photo_url: photo(nom),
      lien: lien(nom),
      date_fin: null,
      enseigne: slug,
      ville: "National",
      statut: "auto_draft",
    });
    const releve = (e: ReturnType<typeof element>) => ({
      titre: e.titre,
      prix: e.prix_promo,
      prixNormal: e.prix_normal,
      lien: e.lien,
      dateFin: null,
      photoUrl: e.photo_url,
    });
    const lancer = (slug: string, fichier: string, archive: ReturnType<typeof element>[], lus: ReturnType<typeof element>[]) => {
      const chemin = nodePath.join(dossier, fichier);
      ecrireArchiveEtTrace(chemin, archive, {
        lus: MARQUEUR_LUS,
        plafondAtteint: false,
        interrompu: false,
        enseigne: slug,
        releves: lus.map(releve),
      });
      return execFileSync(process.execPath, ["--import", "tsx", "insert-deals.mjs", chemin], {
        cwd: nodePath.resolve(process.cwd(), "../pipeline"),
        env: process.env,
        stdio: "pipe",
      }).toString();
    };
    try {
      const expireBrouillon = await inserer("kiabi", "expire-brouillon", "expire");
      const imageBrouillon = (await lire(expireBrouillon))?.image;
      const expirePublie = await inserer("kiabi", "expire-publie", "expire");
      await auditer(expirePublie, "publie");
      const baisse = await inserer("kiabi", "baisse", "publie");
      const hausse = await inserer("kiabi", "hausse", "publie");
      const stables: string[] = [];
      for (const nom of ["stable-1", "stable-2", "stable-3", "stable-4"]) stables.push(await inserer("kiabi", nom, "publie"));
      const rejete = await inserer("kiabi", "rejete", "rejete");
      await auditer(rejete, "rejete");
      await query(
        `insert into memoire_curation (empreinte, decision, deal_origine_public_id, motif, decide_par)
         values (empreinte_curation($1, '', null), 'rejete', $2, 'Test', $3)`,
        [lien("rejete"), rejete, userId]
      );
      const soumis = await inserer("kiabi", "soumis", "expire", { submitter: userId });

      const archive = [
        element("kiabi", "expire-brouillon", 45),
        element("kiabi", "expire-publie", 45),
        element("kiabi", "rejete", 45),
        element("kiabi", "soumis", 45),
      ];
      const lus = [
        ...archive,
        element("kiabi", "baisse", 40),
        element("kiabi", "hausse", 95),
        ...["stable-1", "stable-2", "stable-3", "stable-4"].map((n) => element("kiabi", n, 50)),
      ];
      const sortie = lancer("kiabi", "2026-11-23_05-00_kiabi.json", archive, lus);
      const resume = JSON.parse(sortie.match(/^RESUME_JSON=(.*)$/m)?.[1] ?? "{}") as Record<string, number>;

      const a = await lire(expireBrouillon);
      check("brouillon expiré → même public_id, en brouillon, nouveau prix", a?.statut === "auto_draft" && Number(a.prix) === 45);
      check("brouillon expiré → aucune nouvelle ligne", (await lignesDe("expire-brouillon")) === 1);
      check("image conservée, URL source mémorisée", a?.image === imageBrouillon && a?.source === photo("expire-brouillon"));
      check("réactivation d'un jamais publié → reste non protégé", a?.protege === false);
      const trace = await query<{ details: Record<string, unknown>; action: string }>(
        "select action, details from journal_audit where cible_id = $1",
        [expireBrouillon]
      );
      check(
        "trace de réactivation",
        trace.length === 1 && trace[0]?.action === "update_deal" && trace[0]?.details.operation === "reactivation"
      );

      const client = await getPool().connect();
      try {
        await client.query("begin");
        await client.query(
          "update deals set supprime_le = now() where statut = 'auto_draft' and supprime_le is null and public_id <> $1",
          [expirePublie]
        );
        const decisions = await appliquerPublicationAuto(client);
        check("publié puis expiré → de nouveau publié, même URL", decisions.find((d) => d.publicId === expirePublie)?.publie === true);
      } finally {
        await client.query("rollback");
        client.release();
      }
      check("publié puis expiré → aucune nouvelle ligne", (await lignesDe("expire-publie")) === 1);

      const b = await lire(baisse);
      check("publié, prix en baisse → prix mis à jour sur la même ligne", b?.statut === "publie" && Number(b.prix) === 40);
      check("prix en baisse → aucune nouvelle ligne", (await lignesDe("baisse")) === 1);
      const h = await lire(hausse);
      check("prix en hausse sous les critères → expire", h?.statut === "expire" && Number(h.prix) === 50);
      check("prix stable → inchangé et revu", (await lire(stables[0]!))?.vu === true);
      const r = await lire(rejete);
      check("rejet admin → bloqué, ligne intacte", r?.statut === "rejete" && Number(r.prix) === 50 && (await lignesDe("rejete")) === 1);
      const s = await lire(soumis);
      check("soumission expirée → ni réactivée, ni dupliquée", s?.statut === "expire" && (await lignesDe("soumis")) === 1);
      check(
        "résumé : réactivés, mis à jour, expirés",
        resume.reactives === 2 && resume.misAJour === 1 && resume.expiresPrix === 1 && resume.inseres === 0
      );

      const garde1 = await inserer("universparadiscount", "garde-1", "publie");
      const garde2 = await inserer("universparadiscount", "garde-2", "publie");
      const hausses = [element("universparadiscount", "garde-1", 95), element("universparadiscount", "garde-2", 95)];
      const sortieGarde = lancer("universparadiscount", "2026-11-23_05-00_universparadiscount.json", [], hausses);
      const resumeGarde = JSON.parse(sortieGarde.match(/^RESUME_JSON=(.*)$/m)?.[1] ?? "{}") as Record<string, number>;
      check(
        "plus de 25 % à expirer → aucune expiration sur ce run",
        (await lire(garde1))?.statut === "publie" && (await lire(garde2))?.statut === "publie" && resumeGarde.expirationsBloquees === 2
      );
    } finally {
      rmSync(dossier, { recursive: true, force: true });
      await query("delete from pipeline_runs where elements_lus = $1", [MARQUEUR_LUS]);
      await query("delete from journal_audit where cible_type = 'deal' and cible_id = any($1::text[])", [creer]);
      await query("delete from memoire_curation where deal_origine_public_id = any($1::text[])", [creer]);
      await query("delete from deals where public_id = any($1::text[])", [creer]);
    }
  }

  // ----------------------------------------------------------------
  // Fusion des fiches (lot SEO-2j) : redirection, sitemap, et VRAI
  // insert-deals.mjs : c'est toujours la fiche conservée qui est touchée.
  // ----------------------------------------------------------------
  // ----------------------------------------------------------------
  // Portée d'un rejet admin (lot SEO-2k), de bout en bout avec le VRAI
  // insert-deals.mjs, puis la publication automatique.
  // ----------------------------------------------------------------
  // ----------------------------------------------------------------
  // Promo terminée à la source (lot SEO-2l), de bout en bout avec le VRAI
  // insert-deals.mjs. Jours calculés par Postgres, à Casablanca.
  // ----------------------------------------------------------------
  console.log("\npromo terminée à la source — ignorée avant toute étape");
  {
    const MARQUEUR_LUS = 6666;
    const dossier = mkdtempSync(nodePath.join(tmpdir(), "promo-terminee-"));
    const ancien = "2026-01-01T00:00:00Z";
    const ids = {
      publiee: generatePublicId(),
      expiree: generatePublicId(),
      publieeDuJour: generatePublicId(),
      expireeDuJour: generatePublicId(),
    };
    const titre = (nom: string) => `Promo terminée ${nom}`;
    const lien = (nom: string) => `https://exemple.test/promo-terminee/${nom}`;
    const lire = async (id: string) =>
      (
        await query<{ statut: string; prix: string; vu: boolean; maj: boolean }>(
          `select statut, prix_promo as prix, vu_le > $2::timestamptz as vu, updated_at > $2::timestamptz as maj
             from deals where public_id = $1`,
          [id, ancien]
        )
      )[0];
    try {
      await query("insert into enseignes (slug, nom) values ('kiabi', 'kiabi') on conflict (slug) do nothing");
      const jours = await query<{ hier: string; jour: string }>(
        `select ((now() at time zone 'Africa/Casablanca')::date - 1)::text as hier,
                (now() at time zone 'Africa/Casablanca')::date::text as jour`
      );
      const { hier, jour } = jours[0]!;
      for (const [cle, statut] of [
        ["publiee", "publie"],
        ["expiree", "expire"],
        ["publieeDuJour", "publie"],
        ["expireeDuJour", "expire"],
      ] as const) {
        await query(
          `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, prix_normal, lien, statut, score, vu_le, updated_at)
           values ($1, $2, (select id from enseignes where slug = 'kiabi'), 'Maison', 'en_ligne', 50, 100, $3, $4, 0, $5, $5)`,
          [ids[cle], titre(cle), lien(cle), statut, ancien]
        );
        await query(
          `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
           values ($1, 'update_deal', 'deal', $2, '{"statut":{"avant":"auto_draft","apres":"publie"},"champs":{}}')`,
          [userId, ids[cle]]
        );
      }
      const element = (nom: string, prix: number, dateFin: string) => ({
        titre: titre(nom),
        prix_promo: prix,
        prix_normal: 100,
        categorie: "Maison",
        description: null,
        photo_url: null,
        lien: lien(nom),
        date_fin: dateFin,
        enseigne: "kiabi",
        ville: "National",
        statut: "auto_draft",
      });
      const archive = [
        element("publiee", 40, hier),
        element("expiree", 45, hier),
        element("nouvelle", 45, hier),
        element("publieeDuJour", 40, jour),
        element("expireeDuJour", 45, jour),
      ];
      // Même prix que la fiche, date passée : ne doit pas compter comme « revu ».
      const memePrix = { ...element("publiee", 50, hier) };
      const chemin = nodePath.join(dossier, "2026-11-23_05-00_kiabi.json");
      ecrireArchiveEtTrace(chemin, archive, {
        lus: MARQUEUR_LUS,
        plafondAtteint: false,
        interrompu: false,
        enseigne: "kiabi",
        releves: [...archive, memePrix].map((e) => ({
          titre: e.titre,
          prix: e.prix_promo,
          prixNormal: e.prix_normal,
          lien: e.lien,
          dateFin: e.date_fin,
          photoUrl: null,
        })),
      });
      const sortie = execFileSync(process.execPath, ["--import", "tsx", "insert-deals.mjs", chemin], {
        cwd: nodePath.resolve(process.cwd(), "../pipeline"),
        env: process.env,
        stdio: "pipe",
      }).toString();
      const resume = JSON.parse(sortie.match(/^RESUME_JSON=(.*)$/m)?.[1] ?? "{}") as Record<string, number>;

      const p = await lire(ids.publiee);
      check("date passée, fiche publiée → aucun changement", p?.statut === "publie" && Number(p.prix) === 50 && p.maj === false);
      check("date passée, fiche publiée → vu_le inchangé", p?.vu === false);
      const e = await lire(ids.expiree);
      check("date passée, fiche expirée → pas de réactivation", e?.statut === "expire" && Number(e.prix) === 50 && e.vu === false);
      const n = await query<{ n: number }>("select count(*)::int as n from deals where titre = $1", [titre("nouvelle")]);
      check("date passée, produit inconnu → non inséré", n[0]?.n === 0);
      const pj = await lire(ids.publieeDuJour);
      check("date de fin du jour → fiche publiée mise à jour", pj?.statut === "publie" && Number(pj.prix) === 40 && pj.vu === true);
      const ej = await lire(ids.expireeDuJour);
      check("date de fin du jour → fiche expirée réactivée", ej?.statut === "auto_draft" && Number(ej.prix) === 45);
      check("trace : éléments ignorés comptés", resume.ignoresDateFinPassee === 4);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
      await query("delete from pipeline_runs where elements_lus = $1", [MARQUEUR_LUS]);
      await query("delete from journal_audit where cible_type = 'deal' and cible_id = any($1::text[])", [Object.values(ids)]);
      await query("delete from deals where public_id = any($1::text[])", [Object.values(ids)]);
    }
  }

  console.log("\nrejet admin — ne bloque que les produits jamais publiés");
  {
    const MARQUEUR_LUS = 9999;
    const dossier = mkdtempSync(nodePath.join(tmpdir(), "rejet-"));
    const ancien = "2026-01-01T00:00:00Z";
    const creer: string[] = [];
    const lienDe = (nom: string) => `https://exemple.test/rejet/${nom}`;
    const inserer = async (nom: string, statut: string) => {
      const id = generatePublicId();
      creer.push(id);
      await query(
        `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, prix_normal, lien, statut, score,
                            vu_le, updated_at, image_key, motif_rejet)
         values ($1, $2, (select id from enseignes where slug = 'kiabi'), 'Maison', 'en_ligne', 50, 100, $3, $4, 0,
                 now(), $5, 'deals/test.webp', case when $4 = 'rejete' then 'purge' end)`,
        [id, `Rejet produit ${nom}`, lienDe(nom), statut, ancien]
      );
      return id;
    };
    const auditer = (id: string, apres: string) =>
      query(
        `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
         values ($1, 'update_deal', 'deal', $2, $3)`,
        [userId, id, JSON.stringify({ statut: { avant: "auto_draft", apres }, champs: {} })]
      );
    const rejeter = async (nom: string, publieAvant = false) => {
      const id = await inserer(nom, "rejete");
      if (publieAvant) await auditer(id, "publie");
      await auditer(id, "rejete");
      await query(
        `insert into memoire_curation (empreinte, decision, deal_origine_public_id, motif, decide_par)
         values (empreinte_curation($1, '', null), 'rejete', $2, 'purge', $3)`,
        [lienDe(nom), id, userId]
      );
      return id;
    };
    const lire = async (id: string) =>
      (await query<{ statut: string; prix: string }>("select statut, prix_promo as prix from deals where public_id = $1", [id]))[0];
    const lignes = async (nom: string) =>
      (await query<{ n: number }>("select count(*)::int as n from deals where titre = $1", [`Rejet produit ${nom}`]))[0]?.n;
    const element = (nom: string, prix: number) => ({
      titre: `Rejet produit ${nom}`,
      prix_promo: prix,
      prix_normal: 100,
      categorie: "Maison",
      description: null,
      photo_url: null,
      lien: lienDe(nom),
      date_fin: null,
      enseigne: "kiabi",
      ville: "National",
      statut: "auto_draft",
    });
    try {
      await query("insert into enseignes (slug, nom) values ('kiabi', 'kiabi') on conflict (slug) do nothing");
      const actif = await inserer("doublon-actif", "publie");
      await auditer(actif, "publie");
      const rejeteActif = await rejeter("doublon-actif");
      const expire = await inserer("doublon-expire", "expire");
      await auditer(expire, "publie");
      const rejeteExpire = await rejeter("doublon-expire");
      const jamais = await rejeter("jamais-publie");
      const retire = await rejeter("publie-puis-rejete", true);
      const brouillonRejete = await inserer("brouillon-rejete", "auto_draft");
      await query(
        `insert into memoire_curation (empreinte, decision, deal_origine_public_id, motif, decide_par)
         values (empreinte_curation($1, '', null), 'rejete', $2, 'purge', $3)`,
        [lienDe("brouillon-rejete"), brouillonRejete, userId]
      );

      const archive = [
        element("doublon-actif", 40),
        element("doublon-expire", 45),
        element("jamais-publie", 45),
        element("publie-puis-rejete", 45),
      ];
      const chemin = nodePath.join(dossier, "2026-11-23_05-00_kiabi.json");
      ecrireArchiveEtTrace(chemin, archive, {
        lus: MARQUEUR_LUS,
        plafondAtteint: false,
        interrompu: false,
        enseigne: "kiabi",
        releves: archive.map((e) => ({
          titre: e.titre,
          prix: e.prix_promo,
          prixNormal: e.prix_normal,
          lien: e.lien,
          dateFin: null,
          photoUrl: null,
        })),
      });
      const sortie = execFileSync(process.execPath, ["--import", "tsx", "insert-deals.mjs", chemin], {
        cwd: nodePath.resolve(process.cwd(), "../pipeline"),
        env: process.env,
        stdio: "pipe",
      }).toString();
      const resume = JSON.parse(sortie.match(/^RESUME_JSON=(.*)$/m)?.[1] ?? "{}") as Record<string, number>;

      check("produit publié, doublon rejeté → fiche conservée mise à jour", Number((await lire(actif))?.prix) === 40);
      check("la ligne rejetée reste rejetée", (await lire(rejeteActif))?.statut === "rejete" && Number((await lire(rejeteActif))?.prix) === 50);
      const r = await lire(expire);
      check("produit publié puis expiré, doublon rejeté → fiche conservée réactivée", r?.statut === "auto_draft" && Number(r.prix) === 45);
      check("jamais une fiche rejetée réactivée", (await lire(rejeteExpire))?.statut === "rejete");
      check("produit jamais publié et rejeté → bloqué", (await lire(jamais))?.statut === "rejete" && (await lignes("jamais-publie")) === 1);
      check("seule fiche publiée rejetée → bloqué", (await lire(retire))?.statut === "rejete" && (await lignes("publie-puis-rejete")) === 1);
      check("aucune nouvelle ligne", (await lignes("doublon-actif")) === 2 && (await lignes("doublon-expire")) === 2);
      check(
        "résumé : les deux types de rejet distingués",
        resume.rejetsDoublon === 2 && resume.bloquesRejetAdmin === 2 && resume.reactives === 1 && resume.misAJour === 1 && resume.inseres === 0
      );

      const client = await getPool().connect();
      try {
        await client.query("begin");
        const decisions = await appliquerPublicationAuto(client);
        check("publication auto : doublon rejeté → fiche conservée publiée", decisions.find((d) => d.publicId === expire)?.publie === true);
        const b = decisions.find((d) => d.publicId === brouillonRejete);
        check("publication auto : jamais publié et rejeté → écarté", b?.publie === false && b.motifs.includes("deja_rejete"));
      } finally {
        await client.query("rollback");
        client.release();
      }

      // Diffusions : une fiche fusionnée et sa fiche conservée sont le même produit.
      const conservee = await inserer("diffusion-conservee", "publie");
      const fusionnee = await inserer("diffusion-fusionnee", "expire");
      await query("update deals set fusionne_dans = $1 where public_id = $2", [conservee, fusionnee]);
      await query(
        `insert into diffusions (deal_id, canal, external_message_id, mode)
         values ((select id from deals where public_id = $1), 'telegram', 'message-fusionnee', 'production')`,
        [fusionnee]
      );
      const envois: string[] = [];
      const supprimes: string[] = [];
      const canalTest = {
        nom: "telegram",
        libelle: "Telegram",
        publier: async (m: { titre: string }) => {
          envois.push(m.titre);
          return { messageId: "nouveau", test: false };
        },
        supprimer: async (messageId: string) => {
          supprimes.push(messageId);
        },
      } as unknown as Parameters<typeof diffuser>[2];
      const admin = { id: userId } as unknown as Parameters<typeof diffuser>[0];
      const refus = await diffuser(admin, conservee, canalTest, "production");
      check("fiche conservée d'une fiche déjà diffusée → refus", refus.status === 409 && envois.length === 0);
      const annulation = await annuler(admin, conservee, canalTest);
      check("annulation depuis la fiche conservée → message de la fiche fusionnée", annulation.status === 200 && supprimes[0] === "message-fusionnee");
      const accepte = await diffuser(admin, conservee, canalTest, "production");
      check("après annulation → la fiche conservée se diffuse", accepte.status === 200 && envois.length === 1);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
      await query("delete from pipeline_runs where elements_lus = $1", [MARQUEUR_LUS]);
      await query("delete from journal_audit where cible_type = 'deal' and cible_id = any($1::text[])", [creer]);
      await query("delete from memoire_curation where deal_origine_public_id = any($1::text[])", [creer]);
      await query("delete from deals where public_id = any($1::text[]) and fusionne_dans is not null", [creer]);
      await query("delete from deals where public_id = any($1::text[])", [creer]);
    }
  }

  console.log("\nfusion des fiches — redirection, sitemap, fiche conservée");
  {
    const MARQUEUR_LUS = 8888;
    const dossier = mkdtempSync(nodePath.join(tmpdir(), "fusion-"));
    const ancien = "2026-01-01T00:00:00Z";
    const ids = {
      garde: generatePublicId(),
      fusionnee: generatePublicId(),
      gardeExpiree: generatePublicId(),
      fusionneeExpiree: generatePublicId(),
    };
    const lienPrix = "https://exemple.test/fusion/prix";
    const lienRetour = "https://exemple.test/fusion/retour";
    const inserer = (id: string, titre: string, lien: string, statut: string, fusionneDans: string | null) =>
      query(
        `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, prix_normal, lien, statut, score,
                            vu_le, updated_at, fusionne_dans)
         values ($1, $2, (select id from enseignes where slug = 'kiabi'), 'Maison', 'en_ligne', 50, 100, $3, $4, 0, $5, $5, $6)`,
        [id, titre, lien, statut, ancien, fusionneDans]
      );
    const lire = async (id: string) =>
      (
        await query<{ statut: string; prix: string; vu: boolean }>(
          "select statut, prix_promo as prix, vu_le > $2::timestamptz as vu from deals where public_id = $1",
          [id, ancien]
        )
      )[0];
    try {
      await query("insert into enseignes (slug, nom) values ('kiabi', 'kiabi') on conflict (slug) do nothing");
      await inserer(ids.garde, "Fusion produit prix", lienPrix, "publie", null);
      await inserer(ids.fusionnee, "Fusion produit prix", lienPrix, "expire", ids.garde);
      await inserer(ids.gardeExpiree, "Fusion produit retour", lienRetour, "expire", null);
      await inserer(ids.fusionneeExpiree, "Fusion produit retour", lienRetour, "expire", ids.gardeExpiree);
      for (const id of Object.values(ids)) {
        await query(
          `insert into journal_audit (admin_id, action, cible_type, cible_id, details)
           values ($1, 'update_deal', 'deal', $2, '{"statut":{"avant":"auto_draft","apres":"publie"},"champs":{}}')`,
          [userId, id]
        );
      }

      check("fiche fusionnée → redirection vers la fiche conservée", (await fetchCibleFusion(ids.fusionnee))?.publicId === ids.garde);
      check("fiche conservée → pas de redirection", (await fetchCibleFusion(ids.garde)) === null);
      const sitemap = await (await getSitemapDeals(new Request("http://localhost/sitemap-deals.xml"))).text();
      check("fiche fusionnée absente du sitemap", !sitemap.includes(ids.fusionnee));
      check("fiche conservée présente dans le sitemap", sitemap.includes(ids.garde));

      let refuse = false;
      try {
        await query("update deals set statut = 'publie' where public_id = $1", [ids.fusionnee]);
      } catch {
        refuse = true;
      }
      check("fiche fusionnée : republication refusée par la base", refuse);

      const element = (titre: string, lien: string, prix: number) => ({
        titre,
        prix_promo: prix,
        prix_normal: 100,
        categorie: "Maison",
        description: null,
        photo_url: null,
        lien,
        date_fin: null,
        enseigne: "kiabi",
        ville: "National",
        statut: "auto_draft",
      });
      const archive = [element("Fusion produit prix", lienPrix, 40), element("Fusion produit retour", lienRetour, 45)];
      const chemin = nodePath.join(dossier, "2026-11-23_05-00_kiabi.json");
      ecrireArchiveEtTrace(chemin, archive, {
        lus: MARQUEUR_LUS,
        plafondAtteint: false,
        interrompu: false,
        enseigne: "kiabi",
        releves: archive.map((e) => ({
          titre: e.titre,
          prix: e.prix_promo,
          prixNormal: e.prix_normal,
          lien: e.lien,
          dateFin: null,
          photoUrl: null,
        })),
      });
      execFileSync(process.execPath, ["--import", "tsx", "insert-deals.mjs", chemin], {
        cwd: nodePath.resolve(process.cwd(), "../pipeline"),
        env: process.env,
        stdio: "pipe",
      });

      check("prix changé → fiche conservée mise à jour", Number((await lire(ids.garde))?.prix) === 40);
      const f1 = await lire(ids.fusionnee);
      check("prix changé → fiche fusionnée intacte", f1?.statut === "expire" && Number(f1.prix) === 50 && f1.vu === false);
      const g2 = await lire(ids.gardeExpiree);
      check("produit revenu → fiche conservée réactivée", g2?.statut === "auto_draft" && Number(g2.prix) === 45);
      const f2 = await lire(ids.fusionneeExpiree);
      check("produit revenu → fiche fusionnée jamais réactivée", f2?.statut === "expire" && Number(f2.prix) === 50);
      const total = await query<{ n: number }>("select count(*)::int as n from deals where titre like 'Fusion produit %'");
      check("aucune nouvelle ligne", total[0]?.n === 4);

      await query("update deals set supprime_le = now() where public_id = $1", [ids.garde]);
      check("fiche conservée supprimée → plus de redirection vers un 404", (await fetchCibleFusion(ids.fusionnee)) === null);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
      await query("delete from pipeline_runs where elements_lus = $1", [MARQUEUR_LUS]);
      await query("delete from journal_audit where cible_type = 'deal' and cible_id = any($1::text[])", [Object.values(ids)]);
      await query("delete from deals where public_id = any($1::text[]) and fusionne_dans is not null", [Object.values(ids)]);
      await query("delete from deals where public_id = any($1::text[])", [Object.values(ids)]);
    }
  }

  console.log("\npublication automatique — critères, plafond, soumissions, interrupteur");
  {
    type CasBrouillon = {
      titre?: string;
      enseigne?: string;
      lien?: string | null;
      categorie?: string;
      prixPromo?: number;
      prixNormal?: number | null;
      image?: string | null;
      vuIlYaHeures?: number;
      dateFinDecalage?: number | null;
      submitter?: string | null;
    };
    const insererBrouillon = async (client: PoolClient, c: CasBrouillon = {}) => {
      const id = generatePublicId();
      const slug = c.enseigne ?? "kiabi";
      await client.query("insert into enseignes (slug, nom) values ($1, $1) on conflict (slug) do nothing", [slug]);
      await client.query(
        `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, prix_normal, image_key, lien,
                            statut, score, vu_le, date_fin, submitter_id)
         values ($1, $2, (select id from enseignes where slug = $3), $4, 'en_ligne', $5, $6, $7, $8, 'auto_draft', 0,
                 now() - make_interval(hours => $9::int),
                 case when $10::int is null then null
                      else (now() at time zone 'Africa/Casablanca')::date + $10::int end,
                 $11)`,
        [
          id,
          c.titre ?? `Publication auto ${id}`,
          slug,
          c.categorie ?? "Mode",
          c.prixPromo ?? 60,
          c.prixNormal === undefined ? 100 : c.prixNormal,
          c.image === undefined ? "deals/test.webp" : c.image,
          c.lien === undefined ? `https://exemple.test/${id}` : c.lien,
          c.vuIlYaHeures ?? 1,
          c.dateFinDecalage ?? null,
          c.submitter ?? null,
        ]
      );
      return id;
    };
    const dansTransaction = async <T,>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
      const client = await getPool().connect();
      try {
        await client.query("begin");
        await client.query("update deals set supprime_le = now() where statut = 'auto_draft' and supprime_le is null");
        return await fn(client);
      } finally {
        await client.query("rollback");
        client.release();
      }
    };
    const casSimple = (c: CasBrouillon) =>
      dansTransaction(async (client) => {
        const id = await insererBrouillon(client, c);
        const decisions = await appliquerPublicationAuto(client);
        const { rows } = await client.query<{ statut: string; motifs: string[] | null }>(
          "select statut, motifs_publication_auto as motifs from deals where public_id = $1",
          [id]
        );
        return { decision: decisions.find((d) => d.publicId === id), statut: rows[0]?.statut, motifs: rows[0]?.motifs ?? [] };
      });

    await dansTransaction(async (client) => {
      const id = await insererBrouillon(client);
      const [decision] = await appliquerPublicationAuto(client);
      const { rows: deal } = await client.query<{ statut: string; protege: boolean }>(
        "select d.statut, p.protege from deals d join deals_protection p using (public_id) where d.public_id = $1",
        [id]
      );
      const { rows: audit } = await client.query<{ admin_id: string; action: string; details: Record<string, unknown> }>(
        "select admin_id, action, details from journal_audit where cible_type = 'deal' and cible_id = $1",
        [id]
      );
      check("deal valide → publié", decision?.publie === true && deal[0]?.statut === "publie");
      check("publication → indexable (deals_protection)", deal[0]?.protege === true);
      check("une seule trace, même action qu'une publication manuelle", audit.length === 1 && audit[0]?.action === "update_deal");
      check("trace : utilisateur système", audit[0]?.admin_id === UTILISATEUR_SYSTEME_ID);
      check(
        "trace : statut, acteur et version des règles",
        JSON.stringify(audit[0]?.details.statut) === JSON.stringify({ apres: "publie", avant: "auto_draft" }) &&
          audit[0]?.details.acteur === "publication-auto" &&
          audit[0]?.details.versionRegles === VERSION_REGLES
      );
    });

    const echecs: [string, CasBrouillon, string][] = [
      ["source hors cron (decathlon)", { enseigne: "decathlon" }, "source_hors_cron"],
      ["Carrefour sur un domaine inconnu", { enseigne: "carrefour" }, "source_hors_cron"],
      ["vu il y a 49 h", { vuIlYaHeures: 49 }, "non_revu_48h"],
      ["prix d'origine absent", { prixNormal: null }, "prix_origine_invalide"],
      ["prix d'origine égal au prix promo", { prixPromo: 100, prixNormal: 100 }, "prix_origine_invalide"],
      ["remise de 19 %", { prixPromo: 81 }, "remise_hors_bornes"],
      ["remise de 81 %", { prixPromo: 19 }, "remise_hors_bornes"],
      ["catégorie Autre", { categorie: "Autre" }, "categorie_autre"],
      ["image absente", { image: null }, "image_absente"],
      ["titre de 9 caractères", { titre: "Neuf lett" }, "titre_trop_court"],
      ["date de fin hier", { dateFinDecalage: -1 }, "date_fin_passee"],
    ];
    for (const [label, cas, motif] of echecs) {
      const r = await casSimple(cas);
      check(`${label} → reste brouillon, motif ${motif}`, r.statut === "auto_draft" && r.motifs.includes(motif));
    }
    for (const [label, cas] of [
      ["remise de 20 % pile", { prixPromo: 80 }],
      ["remise de 80 % pile", { prixPromo: 20 }],
      ["titre de 10 caractères", { titre: "Dix lettre" }],
      ["date de fin aujourd'hui", { dateFinDecalage: 0 }],
      ["vu il y a 47 h", { vuIlYaHeures: 47 }],
      ["Bringo (domaine, enseigne Carrefour)", { enseigne: "carrefour", lien: "https://www.bringo.ma/p/1" }],
      ["inwi sans lien", { enseigne: "inwi", lien: null }],
    ] as [string, CasBrouillon][]) {
      check(`${label} → publié`, (await casSimple(cas)).statut === "publie");
    }

    await dansTransaction(async (client) => {
      const id = await insererBrouillon(client, { lien: "https://exemple.test/deja-rejete" });
      await client.query(
        `insert into memoire_curation (empreinte, decision, deal_origine_public_id, motif, decide_par)
         values (empreinte_curation('https://exemple.test/deja-rejete', '', null), 'rejete', $1, 'test', $2)`,
        [id, userId]
      );
      const [decision] = await appliquerPublicationAuto(client);
      check("empreinte rejetée par l'admin → jamais publié", decision?.publie === false && decision.motifs.includes("deja_rejete"));
    });

    await dansTransaction(async (client) => {
      const faible = await insererBrouillon(client, { enseigne: "ab-maroc", prixPromo: 79 });
      for (let i = 0; i < 30; i++) await insererBrouillon(client, { enseigne: "ab-maroc", prixPromo: 50 });
      const autreSource = await insererBrouillon(client, { enseigne: "kiabi" });
      const decisions = await appliquerPublicationAuto(client);
      const abMaroc = decisions.filter((d) => d.source === "ab-maroc");
      check("plafond : 30 publiés par source", abMaroc.filter((d) => d.publie).length === 30);
      const ecarte = decisions.find((d) => d.publicId === faible);
      check("plafond : la plus faible remise reste en brouillon", ecarte?.publie === false && ecarte.motifs[0] === "plafond_source");
      check("plafond : par source, l'autre source n'est pas touchée", decisions.find((d) => d.publicId === autreSource)?.publie === true);
      const resume = resumerParSource(decisions).find((l) => l.source === "ab-maroc");
      check("résumé par source et par motif", resume?.publies === 30 && resume.ecartes === 1 && resume.motifs.plafond_source === 1);
    });

    await dansTransaction(async (client) => {
      const id = await insererBrouillon(client, { submitter: userId });
      const decisions = await appliquerPublicationAuto(client);
      const { rows } = await client.query<{ statut: string }>("select statut from deals where public_id = $1", [id]);
      check("soumission communautaire → jamais publiée ni évaluée", rows[0]?.statut === "auto_draft" && decisions.length === 0);
    });

    const ID_INTERRUPTEUR = generatePublicId();
    try {
      await query(
        `insert into deals (public_id, titre, categorie, type, prix_promo, prix_normal, image_key, statut, score, enseigne_id)
         values ($1, 'Publication auto — interrupteur', 'Mode', 'en_ligne', 60, 100, 'deals/test.webp', 'auto_draft', 0,
                 (select id from enseignes order by id limit 1))`,
        [ID_INTERRUPTEUR]
      );
      for (const valeur of ["off", undefined]) {
        const env = { ...process.env };
        if (valeur === undefined) delete env.AUTO_PUBLICATION;
        else env.AUTO_PUBLICATION = valeur;
        const sortie = execFileSync(process.execPath, ["--import", "tsx", "publier-auto.mjs"], {
          cwd: nodePath.resolve(process.cwd(), "../pipeline"),
          env,
          stdio: "pipe",
        }).toString();
        const { 0: ligne } = await query<{ statut: string; motifs: string[] | null }>(
          "select statut, motifs_publication_auto as motifs from deals where public_id = $1",
          [ID_INTERRUPTEUR]
        );
        check(
          `interrupteur ${valeur ?? "absent"} → aucune écriture, et journalisé`,
          ligne?.statut === "auto_draft" && ligne.motifs === null && sortie.includes("désactivée")
        );
      }
    } finally {
      await query("delete from deals where public_id = $1", [ID_INTERRUPTEUR]);
    }
  }

  console.log("\nexpiration des deals publiés — jour de Casablanca calculé par Postgres");
  {
    async function casExpiration(
      instant: string,
      deals: { statut: string; dateFin: string }[]
    ): Promise<{ expires: string[]; statuts: string[] }> {
      const ids = deals.map(() => generatePublicId());
      const client = await getPool().connect();
      try {
        await client.query("begin");
        for (const [i, d] of deals.entries()) {
          await client.query(
            `insert into deals (public_id, titre, categorie, type, prix_promo, statut, score, date_fin)
             values ($1, 'Expiration publiés — test', 'Autre', 'physique', 10, $2, 0, $3)`,
            [ids[i], d.statut, d.dateFin]
          );
        }
        const expires = await expirerPublies(client, instant);
        const { rows } = await client.query<{ public_id: string; statut: string }>(
          "select public_id, statut from deals where public_id = any($1::text[])",
          [ids]
        );
        const parId = new Map(rows.map((r) => [r.public_id, r.statut]));
        return { expires: expires.filter((id) => ids.includes(id)), statuts: ids.map((id) => parId.get(id) ?? "?") };
      } finally {
        await client.query("rollback");
        client.release();
      }
    }

    // Instants volontairement éloignés de minuit : le décalage UTC de
    // Africa/Casablanca diffère entre les données de fuseau du Postgres de
    // CI et celles de la prod (docs/IDEES.md, 22/11/2026) — un cas à 23:30
    // UTC testerait la base de fuseaux, pas la requête.
    const lendemain = await casExpiration("2026-11-23T12:00:00Z", [{ statut: "publie", dateFin: "2026-11-22" }]);
    check("12:00 UTC le 23, date_fin 22 → expire", lendemain.statuts[0] === "expire" && lendemain.expires.length === 1);

    const memeJour = await casExpiration("2026-11-22T12:00:00Z", [{ statut: "publie", dateFin: "2026-11-22" }]);
    check("12:00 UTC le 22, date_fin 22 → reste publie (le jour de fin reste publié)", memeJour.statuts[0] === "publie" && memeJour.expires.length === 0);

    const veille = await casExpiration("2026-11-22T22:30:00Z", [{ statut: "publie", dateFin: "2026-11-22" }]);
    check("22:30 UTC (23:30 le 22 à Casablanca), date_fin 22 → reste publie", veille.statuts[0] === "publie" && veille.expires.length === 0);

    const avant = await casExpiration("2026-11-22T10:00:00Z", [{ statut: "publie", dateFin: "2026-11-23" }]);
    check("10:00 UTC le 22, date_fin 23 → reste publie", avant.statuts[0] === "publie" && avant.expires.length === 0);

    const autres = await casExpiration("2026-11-22T23:30:00Z", [
      { statut: "auto_draft", dateFin: "2026-11-01" },
      { statut: "rejete", dateFin: "2026-11-01" },
    ]);
    check(
      "auto_draft et rejete à date_fin passée → non touchés",
      autres.statuts[0] === "auto_draft" && autres.statuts[1] === "rejete" && autres.expires.length === 0
    );
  }

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
