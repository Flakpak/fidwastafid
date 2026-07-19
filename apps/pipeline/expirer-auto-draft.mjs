// ============================================================
// FIDWASTAFID — Expiration des deals auto_draft trop anciens (Phase 7B)
// Usage : node expirer-auto-draft.mjs
//
// Première étape du run quotidien (avant scraping/insertion) : purge le
// stock mort avant d'ajouter du frais. Tout deal encore en auto_draft
// (jamais vu par un admin — ni validé, ni rejeté) depuis plus de
// SEUIL_JOURS_AUTO_DRAFT jours (expiration.mjs) passe en `expire` —
// CONTRAT-V1 §1 : "Deals expirés : URL vivante à vie, HTTP 200, affichage
// d'un état « expiré » ... jamais de 404/410 sur un deal expiré." Ne
// touche jamais un deal déjà validé (publie), rejeté, ou déjà expiré —
// seul auto_draft est concerné par cette purge automatique.
//
// Prérequis : variable d'env DATABASE_URL (connection string Postgres).
// ============================================================

import pg from "pg";
import { SEUIL_JOURS_AUTO_DRAFT } from "./expiration.mjs";

if (!process.env.DATABASE_URL) {
  console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  // Supabase exige SSL ; un Postgres local sur VPS n'en aura pas forcément.
  ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
});

try {
  await client.connect();
  console.log("🔌 Connecté à la base.");

  // make_interval(days => $1) plutôt qu'une chaîne SQL interpolée : même
  // résultat, sans jamais concaténer de valeur dans le texte de la requête.
  const { rows } = await client.query(
    `update deals
       set statut = 'expire', updated_at = now()
     where statut = 'auto_draft'
       and created_at < now() - make_interval(days => $1)
     returning public_id`,
    [SEUIL_JOURS_AUTO_DRAFT]
  );

  console.log(`✅ ${rows.length} deal(s) auto_draft expiré(s) (plus de ${SEUIL_JOURS_AUTO_DRAFT} jours).`);
} catch (err) {
  console.error("❌ Échec :", err.message);
  process.exit(1);
} finally {
  await client.end();
}
