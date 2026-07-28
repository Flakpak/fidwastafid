import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * L'alphabet de public_id est RÉPLIQUÉ à la main dans insert-deals.mjs —
 * décision assumée (ce dossier reste autonome, sans dépendance à
 * packages/schemas ni à nanoid). Une réplique non gardée finit toujours par
 * diverger, et la divergence ne se voit qu'au moment de l'`insert`, sur
 * `deals_public_id_check`, en pleine exécution nocturne du pipeline.
 *
 * Ce test lit les deux fichiers et compare les constantes. Hors ligne, aucune
 * base : la réplique reste autonome à l'exécution, seul le test la confronte
 * à sa source.
 *
 * Ajouté le 28/07/2026, même lot que le correctif des fixtures d'intégration
 * (PR #59) : c'est la même classe de faute — un alphabet maintenu à la main,
 * dont l'écart ne se révèle qu'en base.
 */

const ici = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ici, "../../..");

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

function extraire(fichier, nomConstante) {
  const source = readFileSync(path.join(RACINE, fichier), "utf8");
  const alphabet = new RegExp(`${nomConstante}\\s*=\\s*"([^"]+)"`).exec(source);
  const longueur = new RegExp(`${nomConstante.replace("ALPHABET", "LENGTH")}\\s*=\\s*(\\d+)`).exec(source);
  return { alphabet: alphabet?.[1], longueur: longueur ? Number(longueur[1]) : undefined };
}

console.log("public_id — la réplique du pipeline suit sa source");

const source = extraire("packages/schemas/src/common.ts", "PUBLIC_ID_ALPHABET");
const replique = extraire("apps/pipeline/insert-deals.mjs", "PUBLIC_ID_ALPHABET");

check("alphabet lu dans packages/schemas", typeof source.alphabet === "string" && source.alphabet.length > 0);
check("alphabet lu dans insert-deals.mjs", typeof replique.alphabet === "string" && replique.alphabet.length > 0);
check(`alphabets identiques (${source.alphabet})`, source.alphabet === replique.alphabet);
check(`longueurs identiques (${source.longueur})`, source.longueur === replique.longueur);
check("l'alphabet exclut bien 0, 1, l et o", !/[01lo]/.test(source.alphabet ?? "01lo"));

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
