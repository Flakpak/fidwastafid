// ============================================================
// FIDWASTAFID — Vérification manuelle du DELETE Storage réel
// (apps/pipeline/purger-images.mjs), à rejouer avant toute décision
// d'armer la purge pour de vrai (workflow_dispatch, actif=true).
//
// Usage : DATABASE_URL=<postgres LOCAL> SUPABASE_URL=... SUPABASE_SECRET_KEY=...
//         node verifier-purge-storage.mjs
//
// PAS un test automatisé de CI (pas dans `pnpm test`) : il déclenche de
// VRAIS appels Storage contre le VRAI projet Supabase (aucun émulateur
// n'existe pour Storage) — volontaire, c'est le seul moyen d'éprouver le
// chemin réel. Deux garde-fous rendent ça sûr :
//   1. Toutes les clés Storage manipulées vivent sous `test-purge/`, hors
//      du motif `deals/{publicId}.webp` (packages/schemas/src/deal.ts) —
//      aucune ne peut jamais être l'image réelle d'un deal.
//   2. DATABASE_URL est vérifié AVANT toute écriture : ce script refuse de
//      tourner contre quoi que ce soit qui ressemble à Supabase (production
//      ou dev) — LOCAL uniquement (docker compose), aucune ligne de test
//      synthétique n'atterrit jamais dans une base partagée.
// ============================================================

import pg from "pg";
import { generatePublicId } from "@fidwastafid/schemas";
import { purgerImages, DELAI_JOURS_PURGE_IMAGES } from "./purger-images.mjs";

let pass = 0;
let fail = 0;
function check(label, condition) {
  if (condition) {
    pass++;
    console.log(`  ok  - ${label}`);
  } else {
    fail++;
    console.log(`FAIL  - ${label}`);
  }
}

const DATABASE_URL = process.env.DATABASE_URL || "";
if (DATABASE_URL.includes("supabase.co")) {
  console.error(
    "Erreur : DATABASE_URL pointe vers Supabase (production ou dev). " +
      "Ce script écrit des lignes synthétiques et ne doit tourner QUE contre " +
      "le Postgres local éphémère (docker compose up -d db)."
  );
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("Erreur : DATABASE_URL manquant (Postgres local attendu).");
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error("Erreur : SUPABASE_URL / SUPABASE_SECRET_KEY manquants (Storage réel requis).");
  process.exit(1);
}

const BUCKET = "deals-images";
const ts = Date.now();

function storageHeaders(key = process.env.SUPABASE_SECRET_KEY) {
  return { apikey: key };
}

async function uploaderTest(cle) {
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${cle}`, {
    method: "POST",
    headers: { ...storageHeaders(), "Content-Type": "image/webp" },
    body: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
  });
  if (!res.ok) throw new Error(`upload de test échoué (${res.status}) pour "${cle}"`);
}

async function existeSurStorage(cle) {
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${cle}`, {
    method: "HEAD",
    headers: storageHeaders(),
  });
  return res.ok;
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
console.log("🔌 Connecté au Postgres local.\n");

let enseigneId;
let publicId1, publicId2, publicId3;
try {
  const e = await client.query("select id from enseignes limit 1");
  enseigneId = e.rows[0]?.id;
  if (!enseigneId) {
    const created = await client.query(
      "insert into enseignes (slug, nom) values ('verif-purge-storage', 'Vérif purge storage') returning id"
    );
    enseigneId = created.rows[0].id;
  }

  // ---------------------------------------------------------------------
  // Scénario 1 — chemin nominal : fichier réel, purge armée, disparition
  // confirmée sur Storage ET marqueur posé en base.
  // ---------------------------------------------------------------------
  console.log("=== Scénario 1 — nominal : fichier réel supprimé pour de bon ===");
  const cle1 = `test-purge/nominal-${ts}.webp`;
  await uploaderTest(cle1);
  check("scénario 1 -> fichier bien présent avant purge", await existeSurStorage(cle1));

  publicId1 = generatePublicId();
  const insert1 = await client.query(
    `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, image_key, supprime_le)
     values ($1, 'Vérif purge storage — nominal', $2, 'Autre', 'physique', 10, 'rejete', 0, $3, now() - interval '100 days')
     returning id`,
    [publicId1, enseigneId, cle1]
  );
  const id1 = insert1.rows[0].id;

  const resultat1 = await purgerImages({ client, delaiJours: DELAI_JOURS_PURGE_IMAGES, actif: true });
  check("scénario 1 -> le candidat a bien été traité", resultat1.traites.some((t) => t.imageKey === cle1));
  check("scénario 1 -> fichier absent du Storage après purge", !(await existeSurStorage(cle1)));
  const apres1 = await client.query("select image_purgee_le from deals where id = $1", [id1]);
  check("scénario 1 -> image_purgee_le posé en base", apres1.rows[0]?.image_purgee_le !== null);

  // ---------------------------------------------------------------------
  // Scénario 2 — fichier déjà absent AVANT même la purge (jamais
  // téléversé). Doit être traité comme un succès (NoSuchKey), pas une
  // erreur — sinon ce candidat bloquerait indéfiniment.
  // ---------------------------------------------------------------------
  console.log("\n=== Scénario 2 — fichier déjà absent (jamais téléversé) ===");
  const cle2 = `test-purge/deja-absent-${ts}.webp`;
  publicId2 = generatePublicId();
  const insert2 = await client.query(
    `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, image_key, supprime_le)
     values ($1, 'Vérif purge storage — déjà absent', $2, 'Autre', 'physique', 10, 'rejete', 0, $3, now() - interval '100 days')
     returning id`,
    [publicId2, enseigneId, cle2]
  );
  const id2 = insert2.rows[0].id;

  let scenario2Leve = null;
  try {
    await purgerImages({ client, delaiJours: DELAI_JOURS_PURGE_IMAGES, actif: true });
  } catch (err) {
    scenario2Leve = err;
  }
  check("scénario 2 -> AUCUNE exception (NoSuchKey traité comme un succès)", scenario2Leve === null);
  const apres2 = await client.query("select image_purgee_le from deals where id = $1", [id2]);
  check("scénario 2 -> marqueur quand même posé (état convergent)", apres2.rows[0]?.image_purgee_le !== null);

  // ---------------------------------------------------------------------
  // Scénario 3 — Storage renvoie une vraie erreur (clé API invalide) :
  // doit lever, et ne JAMAIS poser le marqueur sur un échec réel.
  // ---------------------------------------------------------------------
  console.log("\n=== Scénario 3 — Storage en erreur (clé API invalide) ===");
  const cle3 = `test-purge/erreur-auth-${ts}.webp`;
  await uploaderTest(cle3);
  publicId3 = generatePublicId();
  const insert3 = await client.query(
    `insert into deals (public_id, titre, enseigne_id, categorie, type, prix_promo, statut, score, image_key, supprime_le)
     values ($1, 'Vérif purge storage — erreur auth', $2, 'Autre', 'physique', 10, 'rejete', 0, $3, now() - interval '100 days')
     returning id`,
    [publicId3, enseigneId, cle3]
  );
  const id3 = insert3.rows[0].id;

  const clePrecedente = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SECRET_KEY = "sb_secret_invalide_pour_verification";
  let scenario3Leve = null;
  try {
    await purgerImages({ client, delaiJours: DELAI_JOURS_PURGE_IMAGES, actif: true });
  } catch (err) {
    scenario3Leve = err;
  } finally {
    process.env.SUPABASE_SECRET_KEY = clePrecedente;
  }
  check("scénario 3 -> lève une exception (clé API invalide)", scenario3Leve !== null);
  const apres3 = await client.query("select image_purgee_le from deals where id = $1", [id3]);
  check("scénario 3 -> marqueur PAS posé (échec réel, jamais avalé)", apres3.rows[0]?.image_purgee_le === null);
  check("scénario 3 -> fichier toujours présent sur Storage (rien supprimé)", await existeSurStorage(cle3));
  // Nettoyage manuel — la vraie clé est restaurée, ce fichier n'a jamais été purgé.
  await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${cle3}`, {
    method: "DELETE",
    headers: storageHeaders(),
  });

  // ---------------------------------------------------------------------
  // Scénario 4 — LE PIRE CAS : le DELETE Storage réussit pour de vrai,
  // mais l'écriture du marqueur échoue (simulée via un client dont la
  // requête UPDATE renvoie 0 ligne affectée, sans lever). Doit lever
  // IMMÉDIATEMENT, jamais rapporter un succès silencieux — c'est
  // exactement le scénario « image détruite, base croit qu'elle existe »
  // que ce durcissement doit rendre impossible à masquer.
  // ---------------------------------------------------------------------
  console.log("\n=== Scénario 4 — le pire cas : DELETE Storage OK, écriture du marqueur qui échoue ===");
  const cle4 = `test-purge/pire-cas-${ts}.webp`;
  await uploaderTest(cle4);
  const candidatSynthetique = {
    id: "999999999",
    public_id: generatePublicId(),
    image_key: cle4,
    supprime_le: new Date().toISOString(),
  };

  // Client-façade : la SELECT de candidats() renvoie notre unique ligne
  // synthétique ; la seule UPDATE de purgerImages() renvoie rowCount: 0
  // (comme si la ligne avait disparu entre-temps) — tout le reste
  // (le vrai DELETE Storage) passe par le vrai fetch, inchangé.
  const clientFacade = {
    query: async (sql) => {
      const s = sql.trim().toLowerCase();
      if (s.startsWith("select d.id")) return { rows: [candidatSynthetique] };
      if (s.startsWith("update deals set image_purgee_le")) return { rowCount: 0, rows: [] };
      throw new Error(`clientFacade : requête inattendue : ${sql}`);
    },
  };

  let scenario4Leve = null;
  try {
    await purgerImages({ client: clientFacade, delaiJours: DELAI_JOURS_PURGE_IMAGES, actif: true });
  } catch (err) {
    scenario4Leve = err;
  }
  check("scénario 4 -> lève une exception (marqueur non posé détecté)", scenario4Leve !== null);
  check(
    "scénario 4 -> message explicite (fichier supprimé, marqueur pas posé)",
    scenario4Leve?.message.includes("supprimé du Storage") && scenario4Leve?.message.includes("marqueur")
  );
  check("scénario 4 -> le fichier a QUAND MÊME été réellement supprimé du Storage", !(await existeSurStorage(cle4)));
  console.log(
    "  -> confirmé : Storage dit vrai (fichier détruit), la base ne le sait pas (marqueur jamais écrit) ; " +
      "le run s'arrête bruyamment ici plutôt que de rapporter un succès. Au prochain run réel, ce même deal " +
      "(vraie ligne, vraie sélection) retrouverait le fichier absent (scénario 2 : NoSuchKey = succès) et le " +
      "marqueur serait posé — convergence sur le prochain passage."
  );
} finally {
  await client.query("delete from journal_audit where admin_id = '00000000-0000-0000-0000-000000000001'");
  await client.query(`delete from deals where public_id = any($1::text[])`, [
    [publicId1, publicId2, publicId3].filter(Boolean),
  ]);
  await client.end();
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
