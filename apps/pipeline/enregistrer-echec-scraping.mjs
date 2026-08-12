// ============================================================
// FIDWASTAFID — Enregistre un échec de scraping AVANT insert-deals.mjs
// Usage : node enregistrer-echec-scraping.mjs <source> [cause]
//
// Appelé par pipeline-quotidien.yml quand un scraper ne produit rien
// d'insérable — insert-deals.mjs ne s'exécute jamais dans ces deux cas
// (rien à lui passer), donc rien n'écrirait dans pipeline_runs sans ce
// script dédié. Deux causes distinctes, PAS la même :
//   'injoignable' (défaut)  — AUCUN fichier d'archive produit : crash
//                             réseau/DNS/timeout, le scraper est sorti en
//                             process.exit(1) avant tout writeFileSync
//                             (voir chaque scraper-*.mjs). Panne technique.
//   'rien_retenu'           — un fichier A été produit, mais avec 0 entrée
//                             (le scraper a tourné jusqu'au bout, rien ne
//                             passait son propre filtre de remise). État de
//                             marché possible, pas une panne — même famille
//                             que le 'rien_retenu' émis par insert-deals.mjs
//                             quand le fichier n'est pas vide mais que rien
//                             ne survit à SES filtres à lui.
//
// Variable d'env DATABASE_URL requise, même convention qu'insert-deals.mjs.
// ============================================================

import pg from "pg";
import { enregistrerRun } from "./_lib/pipelineRuns.mjs";

const CAUSES_VALIDES = new Set(["injoignable", "rien_retenu"]);

const source = process.argv[2];
const cause = process.argv[3] || "injoignable";
if (!source) {
  console.error("Usage : node enregistrer-echec-scraping.mjs <source> [injoignable|rien_retenu]");
  process.exit(1);
}
if (!CAUSES_VALIDES.has(cause)) {
  console.error(`Cause "${cause}" invalide — attendu : ${[...CAUSES_VALIDES].join(" ou ")}.`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
});

try {
  await client.connect();
  await enregistrerRun(client, { source, cause, extraits: 0, retenus: 0, inseres: 0, doublons: 0 });
  console.log(`RESUME_JSON=${JSON.stringify({ source, cause, extraits: 0, retenus: 0, inseres: 0, doublons: 0 })}`);
} catch (err) {
  console.error("❌ Échec :", err.message);
  process.exit(1);
} finally {
  await client.end();
}
