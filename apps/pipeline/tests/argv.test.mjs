import { fileURLToPath } from "node:url";
import path from "node:path";
import { premierArgumentUtile, resoudreFichierArgument } from "../argv.mjs";

/**
 * Tests unitaires — offline, aucun réseau ni base de données. Incident du
 * 20/07/2026 : `pnpm --filter pipeline run insert-deals -- <fichier>`
 * transmettait le "--" littéralement à insert-deals.mjs, qui tentait ensuite
 * `readFileSync("--")` → "ENOENT: open '--'". Vérifie que argv.mjs ignore
 * ce séparateur et rapporte des erreurs claires, jamais une stack ENOENT
 * brute.
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
const USAGE = "Usage : node insert-deals.mjs deals-extraits.json";

console.log("premierArgumentUtile — ignore un \"--\" isolé (exemples du lot)");
check("['--', 'f.json'] -> f.json", premierArgumentUtile(["--", "f.json"]) === "f.json");
check("[] -> undefined", premierArgumentUtile([]) === undefined);
check("['f.json'] -> f.json (sans -- ; cas normal après correction du workflow)", premierArgumentUtile(["f.json"]) === "f.json");
check("['--'] -> undefined (rien après le --)", premierArgumentUtile(["--"]) === undefined);

console.log("\nresoudreFichierArgument — messages clairs, jamais de stack ENOENT brute");

const sansArgument = resoudreFichierArgument([], USAGE);
check("[] -> erreur", !sansArgument.ok);
check("[] -> le message inclut l'usage", sansArgument.message.includes(USAGE));

const tiretSeul = resoudreFichierArgument(["--"], USAGE);
check("['--'] seul -> erreur (rien après le séparateur)", !tiretSeul.ok);

const FICHIER_INEXISTANT = "/tmp/ce-fichier-n-existe-vraiment-pas-fidwastafid.json";
const inexistant = resoudreFichierArgument([FICHIER_INEXISTANT], USAGE);
check("fichier inexistant -> erreur", !inexistant.ok);
check("fichier inexistant -> message explicite (pas d'ENOENT brut)", inexistant.message.includes("introuvable"));

const avecTiretEtInexistant = resoudreFichierArgument(["--", FICHIER_INEXISTANT], USAGE);
check(
  "['--', fichier-inexistant] -> erreur explicite (le -- est bien ignoré avant le test d'existence)",
  !avecTiretEtInexistant.ok && avecTiretEtInexistant.message.includes("introuvable")
);

// Fichier réel du repo — évite un fixture dédié, chemin absolu (indépendant
// du cwd d'exécution du test).
const FICHIER_REEL = path.join(__dirname, "..", "expiration.mjs");
const existant = resoudreFichierArgument([FICHIER_REEL], USAGE);
check("fichier existant -> ok:true", existant.ok === true);
check("fichier existant -> fichier renvoyé tel quel", existant.ok && existant.fichier === FICHIER_REEL);

const existantAvecTiret = resoudreFichierArgument(["--", FICHIER_REEL], USAGE);
check("['--', fichier-existant] -> ok:true (le -- est ignoré, incident du 20/07/2026)", existantAvecTiret.ok === true);

console.log(`\n${pass} passés, ${fail} échoués`);
if (fail > 0) process.exit(1);
