import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

/**
 * Vérification en lecture seule (CONTRAT-V1 §7) : compare
 * packages/db/migrations/ à schema_migrations de la base ciblée, dans les
 * deux sens. N'applique jamais rien — l'application reste un geste humain
 * via `pnpm migrate`.
 *
 * Toute incapacité à mener la vérification elle-même (secret absent,
 * connexion refusée, requête en échec) sort en code 2 avec un message
 * "VÉRIFICATION IMPOSSIBLE" — jamais confondue avec un écart réellement
 * détecté (code 1), qui seul doit alerter sur l'état de la prod.
 */
async function chargerEtatCible(): Promise<{ id: string }[]> {
  const url = process.env.CI_MIGRATIONS_CHECK_URL;
  if (!url) {
    throw new Error("CI_MIGRATIONS_CHECK_URL manquant.");
  }
  const pool = new Pool({ connectionString: url });
  try {
    const result = await pool.query<{ id: string }>("select id from schema_migrations");
    return result.rows;
  } finally {
    await pool.end();
  }
}

async function main() {
  const repoFiles = new Set((await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")));

  let appliedRows: { id: string }[];
  try {
    appliedRows = await chargerEtatCible();
  } catch (err) {
    console.error("VÉRIFICATION IMPOSSIBLE — connexion à la base cible échouée.");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  const applied = new Set(appliedRows.map((r) => r.id));
  const nonAppliquees = [...repoFiles].filter((f) => !applied.has(f)).sort();
  const horsRunner = [...applied].filter((id) => !repoFiles.has(id)).sort();

  let ok = true;

  if (nonAppliquees.length > 0) {
    ok = false;
    console.error("ÉCART — migration(s) du repo non appliquée(s) sur la cible :");
    for (const f of nonAppliquees) console.error(`  - ${f}`);
  }

  if (horsRunner.length > 0) {
    ok = false;
    console.error(
      "ÉCART — entrée(s) schema_migrations sans fichier repo correspondant (SQL passé hors runner — interdit par CONTRAT-V1 §7) :"
    );
    for (const id of horsRunner) console.error(`  - ${id}`);
  }

  if (!ok) process.exit(1);

  console.log(`OK — ${repoFiles.size} migration(s) du repo, toutes appliquées, aucun écart.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
