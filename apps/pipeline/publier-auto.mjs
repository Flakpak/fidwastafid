// ============================================================
// FIDWASTAFID — Publication automatique des deals scrapés (lot SEO-2g)
// Usage : node publier-auto.mjs
//
// Étape de pipeline-quotidien.yml : après toutes les insertions (donc après
// la mise à jour de vu_le), avant expirer-auto-draft. Règles :
// _lib/publicationAuto.mjs et CONTRAT-V1 §3, vingt-quatrième amendement.
//
// Interrupteur : variable de dépôt AUTO_PUBLICATION. Toute valeur autre que
// « on » (absente comprise) : aucune écriture, et c'est journalisé.
//
// Aucun repli silencieux : toute erreur annule la transaction et fait sortir
// en code 1 (échec du job).
//
// Prérequis : variable d'env DATABASE_URL.
// ============================================================

import { appendFileSync } from "node:fs";
import pg from "pg";
import { appliquerPublicationAuto, resumerParSource, VERSION_REGLES } from "./_lib/publicationAuto.mjs";

const interrupteur = process.env.AUTO_PUBLICATION;
if (interrupteur !== "on") {
  console.log(
    `::notice::Publication automatique désactivée (AUTO_PUBLICATION=${interrupteur ?? "non définie"}) — aucune écriture.`
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("Erreur : variable d'environnement DATABASE_URL manquante.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  // Supabase exige SSL ; un Postgres local sur VPS n'en aura pas forcément.
  ssl: process.env.DATABASE_URL.includes("supabase.co") ? { rejectUnauthorized: false } : false,
});

function libelleMotifs(motifs) {
  const entrees = Object.entries(motifs);
  return entrees.length ? entrees.map(([m, n]) => `${m} ${n}`).join(", ") : "—";
}

let exitCode = 0;
try {
  await client.connect();
  await client.query("begin");
  const decisions = await appliquerPublicationAuto(client);
  await client.query("commit");

  const resume = resumerParSource(decisions);
  const publies = decisions.filter((d) => d.publie).length;
  console.log(`✅ Publication automatique (règles ${VERSION_REGLES}) : ${publies} publié(s) sur ${decisions.length} brouillon(s).`);
  for (const l of resume) {
    console.log(`   ${l.source} : ${l.publies} publié(s), ${l.ecartes} écarté(s) (${libelleMotifs(l.motifs)})`);
  }
  console.log(`RESUME_PUBLICATION_JSON=${JSON.stringify(resume)}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lignes = resume.map((l) => `| ${l.source} | ${l.publies} | ${l.ecartes} | ${libelleMotifs(l.motifs)} |`);
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [`### Publication automatique (règles ${VERSION_REGLES})`, "", "| Source | Publiés | Écartés | Motifs |", "|---|---|---|---|", ...lignes, ""].join("\n")
    );
  }
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("❌ Échec :", err.message);
  exitCode = 1;
} finally {
  await client.end();
}
process.exit(exitCode);
