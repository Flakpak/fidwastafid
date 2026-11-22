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
// reste dans le sitemap, sans noindex — l'expiration n'est qu'un changement
// de statut.
//
// `date_fin` est de type `date` : comparée au jour calendaire de
// Casablanca, pas à l'UTC (prédicat pur équivalent : estPublieExpirable,
// expiration.mjs). Strictement antérieure : le jour de fin reste publié.
//
// Aucun repli silencieux : toute erreur fait sortir en code 1 et échouer le
// job.
//
// Prérequis : variable d'env DATABASE_URL (connection string Postgres).
// ============================================================

import pg from "pg";
import { FUSEAU_EXPIRATION } from "./expiration.mjs";

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

  // supprime_le IS NULL : même garde que expirer-auto-draft.mjs — un deal
  // soft-supprimé ne change pas de statut pendant qu'il est invisible, pour
  // que sa restauration le renvoie à son vrai statut d'origine.
  const { rows } = await client.query(
    `update deals
       set statut = 'expire', updated_at = now()
     where statut = 'publie'
       and supprime_le is null
       and date_fin < (now() at time zone $1)::date
     returning public_id`,
    [FUSEAU_EXPIRATION]
  );

  console.log(`✅ ${rows.length} deal(s) publié(s) expiré(s) (date de fin antérieure au jour, ${FUSEAU_EXPIRATION}).`);
  for (const r of rows) console.log(`   - ${r.public_id}`);
} catch (err) {
  console.error("❌ Échec :", err.message);
  process.exit(1);
} finally {
  await client.end();
}
