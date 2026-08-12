// ============================================================
// FIDWASTAFID — pipeline_runs : historique persisté du scraping quotidien
// (lot supervision du 12/08/2026, migration 0020).
//
// Partagé entre insert-deals.mjs (cause 'rien_retenu'/'deja_en_base'/'ok' —
// le script a tourné, a un client pg ouvert et les quatre compteurs) et
// enregistrer-echec-scraping.mjs (cause 'injoignable' — le scraper n'a
// produit aucun fichier, insert-deals.mjs ne s'exécute jamais dans ce cas).
// Une seule fonction d'écriture pour ne jamais faire dériver les deux
// chemins d'un même schéma.
// ============================================================

import path from "node:path";

/**
 * Source depuis le nom de fichier d'extraction — tous les scrapers écrivent
 * `extractions/AAAA-MM-JJ_HH-mm_<source>.json` (même format, documenté dans
 * l'en-tête de chacun). Dernier segment séparé par "_", extension retirée.
 */
export function sourceDepuisFichier(fichier) {
  const base = path.basename(fichier, ".json");
  const segments = base.split("_");
  return segments[segments.length - 1];
}

/** Classification en une cause actionnable — voir migration 0020 pour le
 *  détail de chaque valeur. */
export function classifierCause({ retenus, inseres }) {
  if (retenus === 0) return "rien_retenu";
  if (inseres === 0) return "deja_en_base";
  return "ok";
}

/**
 * Écrit une ligne pipeline_runs. `runId` : GITHUB_RUN_ID côté CI (fourni
 * automatiquement par GitHub Actions) — 0 en local/manuel, jamais bloquant
 * (pas une clé d'unicité, seulement une référence pour retrouver le run).
 */
export async function enregistrerRun(client, { source, cause, extraits, retenus, inseres, doublons }) {
  const runId = Number(process.env.GITHUB_RUN_ID) || 0;
  await client.query(
    `insert into pipeline_runs (source, run_id, cause, extraits, retenus, inseres, doublons)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [source, runId, cause, extraits, retenus, inseres, doublons]
  );
}
