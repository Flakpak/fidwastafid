import { withTransaction, closePool, query } from "@fidwastafid/db";
import { POST as postDeal } from "../src/app/api/v1/deals/route.js";
import { POST as postVote, DELETE as deleteVote } from "../src/app/api/v1/deals/[publicId]/votes/route.js";
import {
  POST as postComment,
  GET as getComments,
} from "../src/app/api/v1/deals/[publicId]/commentaires/route.js";
import { GET as getMe, PATCH as patchMe } from "../src/app/api/v1/me/route.js";

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
  const anonKey = readEnv("SUPABASE_ANON_KEY");
  const email = readEnv("TEST_USER_EMAIL");
  const password = readEnv("TEST_USER_PASSWORD");

  const SUPABASE_DOWN_MESSAGE =
    "Supabase dev inaccessible : projet probablement en pause, le réveiller sur supabase.com.";

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new Error(`${SUPABASE_DOWN_MESSAGE} (${(err as Error).message})`);
  }

  if (!response.ok) {
    throw new Error(`${SUPABASE_DOWN_MESSAGE} (HTTP ${response.status})`);
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

const ENSEIGNE_SLUG = "test-integration";
const DEAL_PUBLIC_ID = "itgd2a9qa2";
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
