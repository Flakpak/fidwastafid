// ============================================================
// FIDWASTAFID — Expiration des deals publiés dont la date de fin est passée (lot SEO-2b)
// Usage : node expirer-publies.mjs
//
// Deuxième étape du run quotidien, juste après expirer-auto-draft.mjs.
// Fait générateur (audit SEO du 22/11/2026) : aucun code ne faisait passer
// un deal `publie` en `expire` à l'échéance de sa date de fin — 18 deals
// restaient affichés comme actifs, certains depuis avril.
//
// CONTRAT-V1 §1 : un deal expiré garde son URL à vie (HTTP 200, jamais de
// suppression). Un deal passé par `publie` reste un actif SEO
// (`deals_protection.protege` = true via son historique d'audit) : il
// reste dans le sitemap, sans noindex.
//
// La requête et la règle de date vivent dans _lib/expirerPublies.mjs. Ici :
// lecture de `now()` et UPDATE dans la MÊME transaction, sans aucun calcul
// de date côté Node.
//
// Aucun repli silencieux : toute erreur annule la transaction et fait
// sortir en code 1 (échec du job).
//
// Prérequis : variable d'env DATABASE_URL (connection string Postgres).
// ============================================================

import pg from "pg";
import { expirerPublies } from "./_lib/expirerPublies.mjs";

if (!process.env.DATABASE_URL) {
  console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  // Supabase exige SSL ; un Postgres local sur VPS n'en aura pas forcément.
  ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
});

let exitCode = 0;
try {
  await client.connect();
  console.log("🔌 Connecté à la base.");

  await client.query("begin");
  // now()::text : la valeur reste celle de Postgres, transmise telle quelle,
  // sans passer par un objet Date Node.
  const { rows } = await client.query("select now()::text as instant");
  const instant = rows[0].instant;
  const expires = await expirerPublies(client, instant);
  await client.query("commit");

  console.log(`✅ ${expires.length} deal(s) publié(s) expiré(s) (instant de référence ${instant}, jour calculé à Africa/Casablanca par Postgres).`);
  for (const publicId of expires) console.log(`   - ${publicId}`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("❌ Échec :", err.message);
  exitCode = 1;
} finally {
  await client.end();
}
process.exit(exitCode);
