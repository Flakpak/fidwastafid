// ============================================================
// FIDWASTAFID — Détecte les sources en série d'échecs (lot supervision du
// 12/08/2026, migration 0020, table pipeline_runs).
// Usage : node verifier-sources-mortes.mjs
//
// Lit les runs les plus récents de CHAQUE source déjà connue de
// pipeline_runs et calcule la SÉRIE de runs consécutifs (depuis le plus
// récent) partageant la MÊME cause non-'ok'. Un 'ok' remet la série à zéro
// — une source qui recommence à insérer n'est plus en série d'échec, quelle
// que soit son histoire passée.
//
// SEUILS PAR CAUSE — les trois n'ont pas la même gravité :
//   injoignable  (2) — panne technique, ne se résout pas seule.
//   rien_retenu  (5) — état de marché possible, pas une panne en soi.
//   deja_en_base (7) — catalogue figé chez le marchand, le moins urgent.
// PAS d'exemption par source : bestmark n'est PAS retiré de ce contrôle —
// son zéro n'est pas un état normal documenté, c'est une panne réseau
// depuis dix jours (cause 'injoignable', seuil 2, comme les autres).
//
// Sortie : une ligne ALERTE=<json> par source en série ≥ son seuil, sur
// stdout — le workflow la capture et ouvre/complète une issue par source
// (label alerte-source-<source>) via .github/actions/alerte-issue, SANS
// dupliquer ce mécanisme.
//
// Variable d'env DATABASE_URL requise, même convention qu'insert-deals.mjs.
// Exit 0 dans tous les cas — ce script RAPPORTE, il ne fait jamais échouer
// le job lui-même (l'alerte est portée par l'issue GitHub, pas le run).
// ============================================================

import pg from "pg";

const SEUILS = {
  injoignable: 2,
  rien_retenu: 5,
  deja_en_base: 7,
};

if (!process.env.DATABASE_URL) {
  console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
});

/** Série de runs consécutifs (depuis le plus récent) partageant la même
 *  cause non-'ok'. `causes` déjà triées du plus récent au plus ancien. */
function serieActuelle(causes) {
  if (causes.length === 0 || causes[0] === "ok") return null;
  const cause = causes[0];
  let serie = 0;
  for (const c of causes) {
    if (c !== cause) break;
    serie++;
  }
  return { cause, serie };
}

try {
  await client.connect();

  const { rows: sourcesRows } = await client.query("select distinct source from pipeline_runs order by source");
  const sources = sourcesRows.map((r) => r.source);

  if (sources.length === 0) {
    console.log("Aucune source dans pipeline_runs pour l'instant — rien à vérifier.");
  }

  for (const source of sources) {
    // 20 lignes : large marge au-dessus du plus haut seuil (7), pour ne
    // jamais tronquer une série qui le dépasserait largement.
    const { rows } = await client.query(
      "select cause from pipeline_runs where source = $1 order by cree_le desc limit 20",
      [source]
    );
    const causes = rows.map((r) => r.cause);
    const etat = serieActuelle(causes);

    if (!etat) {
      console.log(`  ok    - ${source} : dernier run 'ok' (ou aucun run), pas de série en cours.`);
      continue;
    }

    const seuil = SEUILS[etat.cause];
    console.log(`  info  - ${source} : série de ${etat.serie} run(s) '${etat.cause}' (seuil ${seuil}).`);

    if (etat.serie >= seuil) {
      console.log(`ALERTE=${JSON.stringify({ source, cause: etat.cause, serie: etat.serie, seuil })}`);
    }
  }
} catch (err) {
  console.error("❌ Échec :", err.message);
  process.exit(1);
} finally {
  await client.end();
}
