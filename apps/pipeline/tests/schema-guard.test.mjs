import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Garde-fou schéma (Phase 7B, incident du 20/07/2026 : le run manuel du
 * cron a échoué sur `column "public_id" does not exist`) — offline, aucune
 * connexion base. `packages/db` n'exporte aucune définition de schéma en
 * JS/TS (juste des fonctions de connexion/migration) : la seule source de
 * vérité mécanique est le texte des fichiers `packages/db/migrations/*.sql`
 * eux-mêmes — `packages/db/src/migrate.ts` les exécute VERBATIM
 * (`client.query(sql)`, aucune transformation) contre toute base migrée.
 * Ce test parse donc directement ce texte plutôt que d'inventer une
 * structure TS parallèle qui pourrait elle-même diverger du réel.
 *
 * Parseur volontairement simple (regex sur le format actuel du fichier,
 * une colonne par ligne, cf. extraireColonnesTable) — pas un parseur SQL
 * général. Sa fragilité est assumée et surveillée : le test échoue
 * explicitement (plutôt que de donner une fausse assurance) si une
 * migration ultérieure introduit un `rename column` sur `deals`, cas que
 * ce parseur simple ne sait pas suivre (cf. bloc "aucun renommage" ci-dessous).
 *
 * Objectif concret : un renommage/suppression future d'une colonne ou
 * d'une valeur de statut que expirer-auto-draft.mjs suppose exister casse
 * CE test en local (`pnpm --filter pipeline test`), avant que le cron en
 * prod ne le découvre à l'exécution.
 */

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "..", "packages", "db", "migrations");
const SCRIPT_PATH = path.join(__dirname, "..", "expirer-auto-draft.mjs");

/** Colonnes d'une `create table <table> (...)` — une colonne par ligne,
 *  séparateur ",\n" (comma immédiatement suivi d'un retour à la ligne :
 *  ne coupe jamais à l'intérieur d'un CHECK sur une seule ligne, ex.
 *  "check (statut in ('a', 'b'))," où les virgules internes sont suivies
 *  d'un espace, jamais d'un \n). Reflète le format réel constaté dans
 *  0001_init.sql, pas une convention SQL générale. */
function extraireColonnesTable(sql, table) {
  const bloc = sql.match(new RegExp(`create table ${table} \\(([\\s\\S]*?)\\n\\);`, "i"));
  if (!bloc) return null;
  return bloc[1]
    .split(",\n")
    .map((ligne) => ligne.trim())
    .filter(Boolean)
    .map((ligne) => ligne.match(/^([a-z_][a-z0-9_]*)\s/i)?.[1])
    .filter((nom) => Boolean(nom));
}

/** Valeurs autorisées d'un `check (statut in (...))` sur `deals`. */
function extraireEnumStatut(sql) {
  const match = sql.match(/statut text not null check \(statut in \(([^)]+)\)\)/i);
  if (!match) return null;
  return match[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
}

console.log("packages/db/migrations/0001_init.sql — extraction du schéma réel de `deals`");
const sqlInit = readFileSync(path.join(MIGRATIONS_DIR, "0001_init.sql"), "utf8");
const colonnesReelles = extraireColonnesTable(sqlInit, "deals");
const enumStatutReel = extraireEnumStatut(sqlInit);

check("le parseur a trouvé la table deals", Array.isArray(colonnesReelles));
check(
  "nombre de colonnes plausible (>= 15) — garde-fou anti-parseur cassé",
  (colonnesReelles?.length ?? 0) >= 15
);
check("l'énumération statut a été relevée", Array.isArray(enumStatutReel));

console.log(
  "\naucune migration ultérieure ne renomme une colonne de deals (sinon le parseur ci-dessus serait obsolète)"
);
const toutesLesMigrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
  .join("\n");
check("aucun `rename column` détecté dans packages/db/migrations/", !/rename column/i.test(toutesLesMigrations));

// Colonnes et valeurs de statut que expirer-auto-draft.mjs suppose exister
// — tenues à la main, à jour avec sa vraie requête SQL. C'est précisément
// ce qu'on confronte au schéma réel ci-dessus (et, plus bas, au texte réel
// du script pour éviter que cette liste dérive silencieusement).
const COLONNES_UTILISEES = ["public_id", "statut", "created_at", "updated_at"];
const VALEURS_STATUT_UTILISEES = ["auto_draft", "expire"];

console.log("\nexpirer-auto-draft.mjs — colonnes utilisées, confrontées au schéma réel de deals");
for (const colonne of COLONNES_UTILISEES) {
  check(`colonne "${colonne}" existe réellement sur deals`, Boolean(colonnesReelles?.includes(colonne)));
}

console.log("\nexpirer-auto-draft.mjs — valeurs de statut utilisées, confrontées à l'enum réel");
for (const valeur of VALEURS_STATUT_UTILISEES) {
  check(`valeur de statut '${valeur}' existe réellement dans l'enum`, Boolean(enumStatutReel?.includes(valeur)));
}

console.log("\nexpirer-auto-draft.mjs — la liste ci-dessus reste fidèle au texte réel du script");
const sourceScript = readFileSync(SCRIPT_PATH, "utf8");
for (const colonne of COLONNES_UTILISEES) {
  check(`le script mentionne bien "${colonne}"`, sourceScript.includes(colonne));
}
for (const valeur of VALEURS_STATUT_UTILISEES) {
  check(`le script mentionne bien '${valeur}'`, sourceScript.includes(`'${valeur}'`));
}

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
