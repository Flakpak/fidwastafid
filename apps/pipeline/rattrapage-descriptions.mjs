// ============================================================
// FIDWASTAFID — Rattrapage descriptions Bringo (run prod du 15/07)
// Usage : node rattrapage-descriptions.mjs [--dry-run]
//
// Pour chaque deal dont le lien est une URL Bringo valide : extrait la
// vraie description depuis la fiche produit et l'UPDATE en base — y
// compris les deals qui portent encore la pseudo-description
// "marque — remise X%" (scraper-bringo.mjs, avant correction du même lot).
//
// Reprenable : le WHERE ne sélectionne que les deals dont la description
// n'est pas encore une vraie description (NULL ou pseudo-description
// « — remise »). Un deal traité avec succès (vraie description en base)
// n'est plus sélectionné au prochain lancement — pas d'état séparé à
// tenir à jour, la description elle-même sert de marqueur. Un échec
// (extraction retournée null → description mise à NULL) reste
// sélectionné et sera retenté automatiquement au prochain lancement.
//
// Colonne touchée : description UNIQUEMENT. Rien d'autre en base.
// ============================================================

import pg from "pg";
import { extraireDescription } from "./fiche-produit.mjs";

const THROTTLE_MIN_MS = 500;
const THROTTLE_MAX_MS = 1000;

if (!process.env.DATABASE_URL) {
  console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
});

function throttleMs() {
  return THROTTLE_MIN_MS + Math.random() * (THROTTLE_MAX_MS - THROTTLE_MIN_MS);
}

async function main() {
  await client.connect();
  console.log(`🔌 Connecté à la base.${DRY_RUN ? " (--dry-run : aucune écriture)" : ""}`);

  const { rows } = await client.query(
    `SELECT public_id, lien FROM deals
     WHERE lien ~* '^https://(www\\.)?bringo\\.ma/'
       AND (description IS NULL OR description LIKE '%— remise%')
     ORDER BY public_id`
  );

  console.log(`📋 ${rows.length} deal(s) restant(s) à traiter.\n`);

  let traites = 0,
    succes = 0,
    echecs = 0;
  const debut = Date.now();

  for (const row of rows) {
    traites++;
    const texte = await extraireDescription(row.lien);

    if (texte) succes++;
    else echecs++;

    if (!DRY_RUN) {
      await client.query(`UPDATE deals SET description = $1 WHERE public_id = $2`, [texte, row.public_id]);
    }

    console.log(
      `  [${traites}/${rows.length}] ${row.public_id} — ${texte ? `${texte.length} caractères` : "échec (description → null)"}`
    );

    await new Promise((r) => setTimeout(r, throttleMs()));
  }

  const dureeS = ((Date.now() - debut) / 1000).toFixed(1);
  console.log(
    `\n✅ Terminé en ${dureeS}s : ${traites} traité(s) | ${succes} description(s) obtenue(s) | ${echecs} échec(s) (description → null)`
  );
}

main()
  .catch((err) => {
    console.error("❌ Échec :", err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
